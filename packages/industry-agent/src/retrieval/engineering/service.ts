import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { directExactConfidence, engineeringConfidencePolicy } from "./confidence.ts";
import { ENGINEERING_RETRIEVAL_CONFIG_V1 } from "./config.ts";
import { scoreEngineeringBusinessFeatures } from "./features.ts";
import { normalizeFusionScores, weightedRrf } from "./fusion.ts";
import { buildEngineeringFilterPlan, parseEngineeringQuery, relaxEngineeringFilters } from "./query-parser.ts";
import type {
	EngineeringArmHit,
	EngineeringEmbeddingProvider,
	EngineeringFusedCandidate,
	EngineeringReranker,
	EngineeringRetrievalArm,
	EngineeringRetrievalBackend,
	EngineeringRetrievalConfig,
	EngineeringRetrievalDebug,
	EngineeringRetrievalTraceSink,
	EngineeringRrfWeights,
	EngineeringSearchDocument,
	EngineeringSearchFilters,
	EngineeringSearchRequest,
	EngineeringSearchResponse,
	EngineeringSearchResult,
	ParsedEngineeringQuery,
} from "./types.ts";

export interface EngineeringRetrievalServiceOptions {
	backend: EngineeringRetrievalBackend;
	embedding: EngineeringEmbeddingProvider;
	reranker: EngineeringReranker;
	config?: EngineeringRetrievalConfig;
	trace?: EngineeringRetrievalTraceSink;
	nowMs?: () => number;
}

interface RetrievalPass {
	arms: Readonly<Record<EngineeringRetrievalArm, readonly EngineeringArmHit[]>>;
	fused: readonly EngineeringFusedCandidate[];
}

interface RankedCandidate {
	result: EngineeringSearchResult;
	document: EngineeringSearchDocument;
	features: Readonly<Record<string, number>>;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function directExactHit(hits: readonly EngineeringArmHit[]): EngineeringArmHit | undefined {
	if (hits.length !== 1) return undefined;
	const strong = hits[0]?.exactKinds?.some(
		(kind) => kind === "ENGINEERING_CODE" || kind === "FULL_NAME" || kind === "NAME",
	);
	return strong ? hits[0] : undefined;
}

function weightsFor(query: ParsedEngineeringQuery, config: EngineeringRetrievalConfig): EngineeringRrfWeights {
	if (query.queryMode === "CODE") return config.weights.DEFAULT;
	return config.weights[query.queryMode];
}

function rerankQuery(query: ParsedEngineeringQuery): string {
	const summary = [
		query.alignmentSide !== "NONE" ? `方向：${query.alignmentSide}` : undefined,
		query.engineeringTypeName ? `工程类型：${query.engineeringTypeName}` : undefined,
		query.engineeringCategoryName ? `工程类别：${query.engineeringCategoryName}` : undefined,
	]
		.filter((value): value is string => Boolean(value))
		.join("；");
	return summary ? `${query.semanticQuery || query.rawQuery}；${summary}` : query.semanticQuery || query.rawQuery;
}

function toDirectResult(document: EngineeringSearchDocument): EngineeringSearchResult {
	return {
		engineeringId: document.engineeringId,
		engineeringName: document.engineeringName,
		unitEngineeringName: document.unitEngineeringName,
		pathText: document.pathText,
		engineeringCategoryName: document.engineeringCategoryName,
		engineeringTypeName: document.engineeringTypeName,
		alignmentCode: document.alignmentCode,
		alignmentSide: document.alignmentSide,
		chainageStartM: document.chainageStartM,
		chainageEndM: document.chainageEndM,
		finalScore: 1,
		scoreBreakdown: { rerank: 1, fusion: 1, business: 1, businessFeatures: { exact: 1 } },
	};
}

function armCounts(
	arms: Readonly<Record<EngineeringRetrievalArm, readonly EngineeringArmHit[]>>,
): Readonly<Record<EngineeringRetrievalArm, number>> {
	return { exact: arms.exact.length, bm25: arms.bm25.length, name: arms.name.length, context: arms.context.length };
}

export class EngineeringRetrievalService {
	private readonly backend: EngineeringRetrievalBackend;
	private readonly embedding: EngineeringEmbeddingProvider;
	private readonly reranker: EngineeringReranker;
	private readonly config: EngineeringRetrievalConfig;
	private readonly trace: EngineeringRetrievalTraceSink | undefined;
	private readonly nowMs: () => number;

	constructor(options: EngineeringRetrievalServiceOptions) {
		this.backend = options.backend;
		this.embedding = options.embedding;
		this.reranker = options.reranker;
		this.config = options.config ?? ENGINEERING_RETRIEVAL_CONFIG_V1;
		this.trace = options.trace;
		this.nowMs = options.nowMs ?? (() => Date.now());
	}

	async search(request: EngineeringSearchRequest): Promise<EngineeringSearchResponse> {
		const started = this.nowMs();
		if (request.query.trim().length === 0)
			throw new IndustryAgentError("INVALID_REQUEST", "engineering search query must not be empty");
		if (request.projectId.trim().length === 0)
			throw new IndustryAgentError("INVALID_REQUEST", "engineering search projectId must not be empty");
		const parseStart = this.nowMs();
		const parsed = parseEngineeringQuery(request, this.config);
		const plan = buildEngineeringFilterPlan(parsed, request.leafOnly);
		const parseMs = this.nowMs() - parseStart;
		const topK = Math.max(1, Math.min(request.topK ?? this.config.finalTopK, this.config.rerankK));
		let relaxedFilters: readonly string[] = [];
		let activeFilters = plan.filters;
		let retrievalMs = 0;
		let embeddingMs = 0;
		let rerankMs = 0;
		let finalArms: Readonly<Record<EngineeringRetrievalArm, readonly EngineeringArmHit[]>> = {
			exact: [],
			bm25: [],
			name: [],
			context: [],
		};
		try {
			const exactStart = this.nowMs();
			let exactHits = await this.backend.searchExact(parsed, activeFilters, this.config.exactTopK);
			retrievalMs += this.nowMs() - exactStart;
			const direct = directExactHit(exactHits);
			if (direct) {
				const result = toDirectResult(direct.document);
				const confidence = directExactConfidence();
				const totalMs = this.nowMs() - started;
				const debug = this.buildDebug(
					request,
					activeFilters,
					{ exact: exactHits.length, bm25: 0, name: 0, context: 0 },
					1,
					relaxedFilters,
					parsed,
					{ parse: parseMs, embedding: 0, retrieve: retrievalMs, rerank: 0, total: totalMs },
				);
				this.recordTrace(request.query, activeFilters, [result], totalMs, "OK");
				return { parsedQuery: parsed, confidence, results: [result], ...(debug ? { debug } : {}) };
			}

			const embedStart = this.nowMs();
			const queryVector = await this.embedding.embed(parsed.semanticQuery || parsed.rawQuery);
			embeddingMs = this.nowMs() - embedStart;
			if (queryVector.length !== this.config.embeddingDimension || queryVector.length !== this.embedding.dimension) {
				throw new IndustryAgentError(
					"RETRIEVAL_ERROR",
					"engineering embedding dimension does not match retrieval config",
					{
						details: {
							expected: this.config.embeddingDimension,
							provider: this.embedding.dimension,
							actual: queryVector.length,
						},
					},
				);
			}

			let pass = await this.retrievePass(parsed, activeFilters, queryVector, exactHits);
			retrievalMs += pass.retrieveMs;
			if (pass.value.fused.length === 0 && plan.relaxable.length > 0) {
				const relaxed = relaxEngineeringFilters(plan);
				activeFilters = relaxed.filters;
				relaxedFilters = relaxed.relaxed;
				const relaxedStart = this.nowMs();
				exactHits = await this.backend.searchExact(parsed, activeFilters, this.config.exactTopK);
				retrievalMs += this.nowMs() - relaxedStart;
				pass = await this.retrievePass(parsed, activeFilters, queryVector, exactHits);
				retrievalMs += pass.retrieveMs;
			}
			finalArms = pass.value.arms;
			if (pass.value.fused.length === 0) {
				const confidence = engineeringConfidencePolicy([], this.config);
				const totalMs = this.nowMs() - started;
				const debug = this.buildDebug(request, activeFilters, armCounts(finalArms), 0, relaxedFilters, parsed, {
					parse: parseMs,
					embedding: embeddingMs,
					retrieve: retrievalMs,
					rerank: 0,
					total: totalMs,
				});
				this.recordTrace(request.query, activeFilters, [], totalMs, "OK");
				return { parsedQuery: parsed, confidence, results: [], ...(debug ? { debug } : {}) };
			}

			const candidates = pass.value.fused.slice(0, this.config.rerankK);
			const rerankStart = this.nowMs();
			const rerankScores = await this.reranker.score(
				rerankQuery(parsed),
				candidates.map((candidate) => candidate.document),
			);
			rerankMs = this.nowMs() - rerankStart;
			if (rerankScores.length !== candidates.length) {
				throw new IndustryAgentError("RETRIEVAL_ERROR", "reranker result count does not match candidate count", {
					details: { candidates: candidates.length, scores: rerankScores.length },
				});
			}
			const ranked = this.finalRank(parsed, candidates, rerankScores).slice(0, topK);
			const results = ranked.map((candidate) => candidate.result);
			const confidence = engineeringConfidencePolicy(results, this.config);
			const totalMs = this.nowMs() - started;
			const debug = this.buildDebug(
				request,
				activeFilters,
				armCounts(finalArms),
				pass.value.fused.length,
				relaxedFilters,
				parsed,
				{ parse: parseMs, embedding: embeddingMs, retrieve: retrievalMs, rerank: rerankMs, total: totalMs },
			);
			this.recordTrace(request.query, activeFilters, results, totalMs, "OK");
			return { parsedQuery: parsed, confidence, results, ...(debug ? { debug } : {}) };
		} catch (cause) {
			const totalMs = this.nowMs() - started;
			this.recordTrace(request.query, activeFilters, [], totalMs, "ERROR");
			if (cause instanceof IndustryAgentError) throw cause;
			throw new IndustryAgentError("RETRIEVAL_ERROR", "engineering hybrid retrieval failed", { cause });
		}
	}

	private async retrievePass(
		parsed: ParsedEngineeringQuery,
		filters: EngineeringSearchFilters,
		queryVector: readonly number[],
		exactHits: readonly EngineeringArmHit[],
	): Promise<{ value: RetrievalPass; retrieveMs: number }> {
		const started = this.nowMs();
		const [bm25, name, context] = await Promise.all([
			this.backend.searchBm25(parsed, filters, this.config.bm25TopK),
			this.backend.searchDense("name_vector", queryVector, filters, this.config.nameVectorTopK),
			this.backend.searchDense("context_vector", queryVector, filters, this.config.contextVectorTopK),
		]);
		const arms = { exact: exactHits, bm25, name, context } as const;
		const fused = weightedRrf(arms, weightsFor(parsed, this.config), this.config.rrfK).slice(
			0,
			this.config.fusionKeepK,
		);
		return { value: { arms, fused }, retrieveMs: this.nowMs() - started };
	}

	private finalRank(
		parsed: ParsedEngineeringQuery,
		candidates: readonly EngineeringFusedCandidate[],
		rerankScores: readonly number[],
	): RankedCandidate[] {
		const fusionNorm = normalizeFusionScores(candidates);
		const ranked = candidates.map((candidate, index): RankedCandidate => {
			const business = scoreEngineeringBusinessFeatures(parsed, candidate.document);
			const rerank = clamp01(rerankScores[index] ?? 0);
			const fusion = fusionNorm.get(candidate.document.engineeringId) ?? 0;
			const finalScore = clamp01(
				this.config.finalScoreWeights.rerank * rerank +
					this.config.finalScoreWeights.fusion * fusion +
					this.config.finalScoreWeights.business * business.score,
			);
			return {
				document: candidate.document,
				features: business.features,
				result: {
					engineeringId: candidate.document.engineeringId,
					engineeringName: candidate.document.engineeringName,
					unitEngineeringName: candidate.document.unitEngineeringName,
					pathText: candidate.document.pathText,
					engineeringCategoryName: candidate.document.engineeringCategoryName,
					engineeringTypeName: candidate.document.engineeringTypeName,
					alignmentCode: candidate.document.alignmentCode,
					alignmentSide: candidate.document.alignmentSide,
					chainageStartM: candidate.document.chainageStartM,
					chainageEndM: candidate.document.chainageEndM,
					finalScore,
					scoreBreakdown: { rerank, fusion, business: business.score, businessFeatures: business.features },
				},
			};
		});
		return ranked.sort((left, right) => {
			const delta = right.result.finalScore - left.result.finalScore;
			if (Math.abs(delta) >= 0.01) return delta;
			const leftExact = (left.features.exactName ?? 0) + (left.features.positionTokenMatch ?? 0);
			const rightExact = (right.features.exactName ?? 0) + (right.features.positionTokenMatch ?? 0);
			if (rightExact !== leftExact) return rightExact - leftExact;
			if ((right.features.unitMatch ?? 0) !== (left.features.unitMatch ?? 0))
				return (right.features.unitMatch ?? 0) - (left.features.unitMatch ?? 0);
			if (parsed.queryMode === "ENTITY_SHORT") {
				if (right.document.isMinUnit !== left.document.isMinUnit) return right.document.isMinUnit ? 1 : -1;
				if (right.document.depth !== left.document.depth) return right.document.depth - left.document.depth;
			}
			return left.document.engineeringId.localeCompare(right.document.engineeringId);
		});
	}

	private buildDebug(
		request: EngineeringSearchRequest,
		filters: EngineeringSearchFilters,
		counts: Readonly<Record<EngineeringRetrievalArm, number>>,
		candidateCount: number,
		relaxedFilters: readonly string[],
		parsed: ParsedEngineeringQuery,
		latencyMs: EngineeringRetrievalDebug["latencyMs"],
	): EngineeringRetrievalDebug | undefined {
		if (!request.debug) return undefined;
		return {
			configVersion: this.config.version,
			indexVersion: this.config.indexVersion,
			embeddingModelVersion: this.embedding.modelVersion,
			rerankerModelVersion: this.reranker.modelVersion,
			armCounts: counts,
			candidateCount,
			relaxedFilters,
			filters,
			weights: weightsFor(parsed, this.config),
			latencyMs,
		};
	}

	private recordTrace(
		query: string,
		filters: EngineeringSearchFilters,
		results: readonly EngineeringSearchResult[],
		latencyMs: number,
		status: "OK" | "ERROR",
	): void {
		this.trace?.recordRetrieval({
			retrievalType: "ENGINEERING_POSITION_HYBRID",
			status,
			query,
			filters: { ...filters },
			candidates: results.map((result) => ({
				engineeringId: result.engineeringId,
				finalScore: result.finalScore,
				rerank: result.scoreBreakdown.rerank,
				fusion: result.scoreBreakdown.fusion,
				business: result.scoreBreakdown.business,
			})),
			indexVersion: this.config.indexVersion,
			modelVersion: `${this.embedding.modelVersion}|${this.reranker.modelVersion}`,
			latencyMs,
		});
	}
}
