import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { buildAccessFilter, isAccessible, validateMetadataFilter } from "./access.ts";
import { buildEvidence } from "./citations.ts";
import { weightedRrf } from "./fusion.ts";
import { applyRerank, diversify } from "./ranking.ts";
import type {
	RagQaDebug,
	RagQaRankedCandidate,
	RagQaRequest,
	RagQaResult,
	RagQaRetrievalArm,
	RagQaSearchCandidate,
	RagQaServiceOptions,
} from "./types.ts";

function nonEmptyQuestion(question: string): string {
	const value = question.trim();
	if (!value) throw new IndustryAgentError("RAG_QA_INVALID_REQUEST", "RAG QA question is required");
	return value;
}

export class RagQaService {
	private readonly options: RagQaServiceOptions;
	constructor(options: RagQaServiceOptions) {
		this.options = options;
	}
	async answer(request: RagQaRequest): Promise<RagQaResult> {
		const question = nonEmptyQuestion(request.question);
		const trace = (
			stage: Parameters<NonNullable<RagQaServiceOptions["trace"]>["record"]>[0]["stage"],
			status: "OK" | "DEGRADED" | "ERROR",
			details?: Record<string, unknown>,
		) =>
			this.options.trace?.record({
				traceId: request.context.traceId,
				requestId: request.context.requestId,
				stage,
				status,
				...(details ? { details } : {}),
			});
		const degraded: string[] = [];
		const resolved = await this.options.contextResolver.resolve({ context: request.context, question });
		trace("CONTEXT", "OK", { entityCount: resolved.entityIds.length });
		const rewrittenQuery = await this.options.rewriter.rewrite(resolved);
		if (!rewrittenQuery.trim())
			throw new IndustryAgentError("RAG_QA_INVALID_REQUEST", "Query rewrite produced an empty query");
		trace("REWRITE", "OK", { version: this.options.rewriter.version });
		const accessContext = await this.options.access.resolve(request.context);
		if (accessContext.userId !== request.context.userId || accessContext.tenantId !== request.context.tenantId)
			throw new IndustryAgentError(
				"RAG_QA_ACCESS_DENIED",
				"Resolved access context does not match authenticated request",
			);
		if (request.context.companyId && accessContext.companyId !== request.context.companyId)
			throw new IndustryAgentError("RAG_QA_ACCESS_DENIED", "Resolved company scope does not match RequestContext");
		if (request.context.projectId && accessContext.projectId !== request.context.projectId)
			throw new IndustryAgentError("RAG_QA_ACCESS_DENIED", "Resolved project scope does not match RequestContext");
		const filter = buildAccessFilter(
			accessContext,
			validateMetadataFilter(request.metadataFilter),
			this.options.config.aclPolicyVersion,
		);
		trace("ACCESS_FILTER", "OK", { aclPolicyVersion: filter.aclPolicyVersion });
		const arms: Partial<Record<RagQaRetrievalArm, readonly RagQaSearchCandidate[]>> = {};
		try {
			arms.BM25 = await this.options.retrieval.bm25(rewrittenQuery, filter, this.options.config.bm25TopK);
		} catch {
			degraded.push("BM25");
		}
		try {
			const vector = await this.options.embedding.embedQuery(rewrittenQuery);
			if (vector.length !== this.options.embedding.dimension)
				throw new IndustryAgentError(
					"RAG_QA_RETRIEVAL_FAILED",
					`Query embedding dimension mismatch: ${vector.length}`,
				);
			arms.DENSE = await this.options.retrieval.dense(vector, filter, this.options.config.denseTopK);
		} catch {
			degraded.push("DENSE");
		}
		if (resolved.entityIds.length && this.options.retrieval.entityAware) {
			try {
				arms.ENTITY = await this.options.retrieval.entityAware(
					rewrittenQuery,
					resolved.entityIds,
					filter,
					this.options.config.entityTopK,
				);
			} catch {
				degraded.push("ENTITY");
			}
		}
		if (!arms.BM25 && !arms.DENSE && !arms.ENTITY)
			throw new IndustryAgentError("RAG_QA_RETRIEVAL_FAILED", "All retrieval arms failed");
		for (const candidates of Object.values(arms))
			for (const candidate of candidates ?? [])
				if (!isAccessible(candidate.document, candidate.chunk, filter))
					throw new IndustryAgentError(
						"RAG_QA_ACCESS_DENIED",
						`Retrieval backend returned an unauthorized chunk: ${candidate.chunk.chunkId}`,
					);
		const armCounts = {
			...(arms.BM25 ? { BM25: arms.BM25.length } : {}),
			...(arms.DENSE ? { DENSE: arms.DENSE.length } : {}),
			...(arms.ENTITY ? { ENTITY: arms.ENTITY.length } : {}),
		};
		trace("RETRIEVAL", degraded.length ? "DEGRADED" : "OK", {
			...armCounts,
			candidateIds: Array.from(
				new Set(Object.values(arms).flatMap((items) => (items ?? []).map((item) => item.chunk.chunkId))),
			).slice(0, 50),
		});
		const fused = weightedRrf(
			arms,
			this.options.config.armWeights,
			this.options.config.rrfK,
			this.options.config.fusionKeepK,
		);
		trace("RRF", "OK", { count: fused.length, version: this.options.config.version });
		let reranked: readonly RagQaRankedCandidate[];
		try {
			const rerankInput = fused.slice(0, this.options.config.rerankK);
			const scores = await this.options.reranker.rerank(rewrittenQuery, rerankInput);
			reranked = applyRerank(rerankInput, scores);
			trace("RERANK", "OK", { count: reranked.length, version: this.options.reranker.version });
		} catch {
			degraded.push("RERANK");
			reranked = fused
				.slice(0, this.options.config.rerankK)
				.map((candidate) => ({ ...candidate, rerankScore: 0, finalScore: candidate.rrfNorm }));
			trace("RERANK", "DEGRADED", { fallback: "RRF" });
		}
		const selected = diversify(reranked, this.options.config.finalK, this.options.config.maxPerDocument);
		trace("DIVERSITY", "OK", { count: selected.length });
		const evidence = await buildEvidence(
			selected,
			this.options.sources,
			filter,
			this.options.config.parentExpansionChars,
		);
		trace("PARENT_EXPANSION", "OK", { count: evidence.length });
		trace("CITATION", "OK", { count: evidence.length });
		const topRerank = evidence[0]?.candidate.rerankScore ?? 0;
		const sufficient =
			evidence.length >= this.options.config.minEvidenceCount &&
			(degraded.includes("RERANK") ? evidence.length > 0 : topRerank >= this.options.config.minTopRerankScore);
		const debug: RagQaDebug = {
			context: resolved,
			rewrittenQuery,
			accessSummary: {
				tenantId: filter.tenantId,
				companyId: filter.companyId,
				projectId: filter.projectId,
				industryId: filter.industryId,
				departmentId: filter.departmentId,
				aclPolicyVersion: filter.aclPolicyVersion,
				metadataFilter: filter.metadataFilter,
			},
			armCounts,
			fusedCount: fused.length,
			rerankedCount: reranked.length,
			evidenceCount: evidence.length,
			degraded,
		};
		if (!sufficient) {
			trace("ANSWER", "OK", { status: "INSUFFICIENT_EVIDENCE" });
			return {
				status: "INSUFFICIENT_EVIDENCE",
				answer: this.options.config.insufficientEvidenceText,
				citations: [],
				...(request.debug ? { debug } : {}),
			};
		}
		const citations = evidence.flatMap((item) =>
			item.parentCitation ? [item.citation, item.parentCitation] : [item.citation],
		);
		let answer: string;
		try {
			answer = await this.options.answerGenerator.generate({
				question,
				rewrittenQuery,
				evidence,
				groundingRule: "EVIDENCE_ONLY",
				allowedCitationIds: citations.map((item) => item.citationId),
			});
		} catch (error) {
			trace("ANSWER", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			throw error;
		}
		trace("ANSWER", "OK", { status: "ANSWERED", citationCount: citations.length });
		return { status: "ANSWERED", answer, citations, ...(request.debug ? { debug } : {}) };
	}
}
