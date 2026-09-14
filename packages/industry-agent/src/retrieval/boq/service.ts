import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { boqConfidencePolicy, descendantsConfidence, exactCodeConfidence } from "./confidence.ts";
import { BOQ_RETRIEVAL_CONFIG_V1 } from "./config.ts";
import { scoreBoqBusinessFeatures } from "./features.ts";
import { weightedBoqRrf } from "./fusion.ts";
import { buildBoqFilters, parseBoqQuery } from "./query-parser.ts";
import type {
	BoqArmHit,
	BoqEmbeddingProvider,
	BoqFusedCandidate,
	BoqReranker,
	BoqRetrievalArm,
	BoqRetrievalBackend,
	BoqRetrievalConfig,
	BoqRetrievalDebug,
	BoqRetrievalTraceSink,
	BoqRrfWeights,
	BoqSearchConfidence,
	BoqSearchDocument,
	BoqSearchFilters,
	BoqSearchRequest,
	BoqSearchResponse,
	BoqSearchResult,
	ParsedBoqQuery,
} from "./types.ts";

export interface BoqRetrievalServiceOptions {
	backend: BoqRetrievalBackend;
	embedding: BoqEmbeddingProvider;
	reranker: BoqReranker;
	config?: BoqRetrievalConfig;
	trace?: BoqRetrievalTraceSink;
	nowMs?: () => number;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function armCounts(
	arms: Readonly<Record<BoqRetrievalArm, readonly BoqArmHit[]>>,
): Readonly<Record<BoqRetrievalArm, number>> {
	return { exact: arms.exact.length, bm25: arms.bm25.length, item: arms.item.length, context: arms.context.length };
}
function weightsFor(query: ParsedBoqQuery, config: BoqRetrievalConfig): BoqRrfWeights {
	return query.queryMode === "CODE" ? config.weights.DEFAULT : config.weights[query.queryMode];
}
function rerankQuery(query: ParsedBoqQuery): string {
	const summary = [
		query.sectionName ? `章节：${query.sectionName}` : undefined,
		query.specTokens.length ? `规格：${query.specTokens.map((t) => t.value).join(" ")}` : undefined,
		query.unit ? `单位：${query.unit}` : undefined,
	]
		.filter(Boolean)
		.join("；");
	return summary ? `${query.semanticQuery || query.rawQuery}；${summary}` : query.semanticQuery || query.rawQuery;
}
function directResult(document: BoqSearchDocument, rankingScore = 1): BoqSearchResult {
	return {
		ledgerId: document.ledgerId,
		ledgerCode: document.ledgerCodeNorm,
		ledgerName: document.ledgerNameNorm,
		...(document.sectionId ? { sectionId: document.sectionId } : {}),
		...(document.sectionName ? { sectionName: document.sectionName } : {}),
		pathText: document.pathText,
		...(document.unitNorm ? { unit: document.unitNorm } : {}),
		specTokens: document.specTokens,
		isLeaf: document.isLeaf,
		hierarchyGap: document.hierarchyGap,
		rankingScore,
		scoreBreakdown: {
			rerank: 1,
			fusion: 1,
			business: 1,
			businessFeatures: { exact_code: 1 },
			criticalSpecConflicts: 0,
			conflictPenalty: 0,
		},
		armSupportCount: 1,
		identityScore: 1,
		filterCoverage: 1,
	};
}

export class BoqRetrievalService {
	private readonly options: BoqRetrievalServiceOptions;
	private readonly config: BoqRetrievalConfig;
	private readonly nowMs: () => number;
	constructor(options: BoqRetrievalServiceOptions) {
		this.options = options;
		this.config = options.config ?? BOQ_RETRIEVAL_CONFIG_V1;
		this.nowMs = options.nowMs ?? (() => Date.now());
	}

	async search(request: BoqSearchRequest): Promise<BoqSearchResponse> {
		const started = this.nowMs();
		if (!request.query.trim()) throw new IndustryAgentError("INVALID_REQUEST", "BOQ search query must not be empty");
		if (!request.projectId.trim())
			throw new IndustryAgentError("INVALID_REQUEST", "BOQ search projectId must not be empty");
		const parseStart = this.nowMs();
		const parsed = parseBoqQuery(request);
		const filters = buildBoqFilters(parsed, request.leafOnly);
		const parseMs = this.nowMs() - parseStart;
		const topK = Math.max(1, Math.min(request.topK ?? this.config.finalTopK, this.config.rerankK));
		let retrieveMs = 0,
			embeddingMs = 0,
			rerankMs = 0;
		const degradedReasons: string[] = [];
		try {
			if (parsed.operation === "LIST_DESCENDANTS") {
				const routeStart = this.nowMs();
				const hits = await this.options.backend.listDescendants(parsed, filters, topK);
				retrieveMs = this.nowMs() - routeStart;
				const results = hits.map((hit, index) => directResult(hit.document, 1 - Math.min(index, 100) / 1000));
				const confidence = descendantsConfidence(results.length);
				const totalMs = this.nowMs() - started;
				const debug = this.debug(
					request,
					filters,
					{ exact: hits.length, bm25: 0, item: 0, context: 0 },
					hits.length,
					["exact"],
					degradedReasons,
					parsed,
					{ parse: parseMs, embedding: 0, retrieve: retrieveMs, rerank: 0, total: totalMs },
				);
				this.trace(request.query, filters, results, totalMs, "OK");
				return { parsedQuery: parsed, confidence, results, ...(debug ? { debug } : {}) };
			}

			if (parsed.ledgerCode) {
				const exactStart = this.nowMs();
				const codeHits = await this.options.backend.searchExactCode(parsed, filters);
				retrieveMs += this.nowMs() - exactStart;
				if (codeHits.length === 1) {
					const result = directResult(codeHits[0]!.document);
					const totalMs = this.nowMs() - started;
					const debug = this.debug(
						request,
						filters,
						{ exact: 1, bm25: 0, item: 0, context: 0 },
						1,
						["exact"],
						degradedReasons,
						parsed,
						{ parse: parseMs, embedding: 0, retrieve: retrieveMs, rerank: 0, total: totalMs },
					);
					this.trace(request.query, filters, [result], totalMs, "OK");
					return {
						parsedQuery: parsed,
						confidence: exactCodeConfidence(),
						results: [result],
						...(debug ? { debug } : {}),
					};
				}
				if (codeHits.length > 1) {
					const results = codeHits.slice(0, topK).map((hit) => directResult(hit.document));
					const confidence: BoqSearchConfidence = {
						autoAccept: false,
						level: "AMBIGUOUS",
						raw: 1,
						reason: "duplicate_exact_code_after_scope",
						recommendedResultCount: results.length,
					};
					const totalMs = this.nowMs() - started;
					const debug = this.debug(
						request,
						filters,
						{ exact: codeHits.length, bm25: 0, item: 0, context: 0 },
						codeHits.length,
						["exact"],
						degradedReasons,
						parsed,
						{ parse: parseMs, embedding: 0, retrieve: retrieveMs, rerank: 0, total: totalMs },
					);
					this.trace(request.query, filters, results, totalMs, "OK");
					return { parsedQuery: parsed, confidence, results, ...(debug ? { debug } : {}) };
				}
			}

			let queryVector: readonly number[] | undefined;
			const embedStart = this.nowMs();
			try {
				queryVector = await this.options.embedding.embed(parsed.semanticQuery || parsed.rawQuery);
				if (
					queryVector.length !== this.config.embeddingDimension ||
					queryVector.length !== this.options.embedding.dimension
				) {
					throw new IndustryAgentError("RETRIEVAL_ERROR", "BOQ query embedding dimension mismatch", {
						details: {
							expected: this.config.embeddingDimension,
							provider: this.options.embedding.dimension,
							actual: queryVector.length,
						},
					});
				}
			} catch {
				queryVector = undefined;
				degradedReasons.push("embedding_unavailable");
			}
			embeddingMs = this.nowMs() - embedStart;

			const retrievalStart = this.nowMs();
			const exactPromise = this.options.backend.searchExact(parsed, filters, this.config.exactTopK);
			const bm25Promise = this.options.backend.searchBm25(parsed, filters, this.config.bm25TopK);
			let itemAvailable = Boolean(queryVector);
			let contextAvailable = Boolean(queryVector);
			let itemPromise: Promise<readonly BoqArmHit[]> = Promise.resolve([]);
			let contextPromise: Promise<readonly BoqArmHit[]> = Promise.resolve([]);
			if (queryVector) {
				itemPromise = this.options.backend
					.searchDense("item_vector", queryVector, filters, this.config.itemVectorTopK)
					.catch(() => {
						itemAvailable = false;
						degradedReasons.push("item_vector_unavailable");
						return [];
					});
				contextPromise = this.options.backend
					.searchDense("context_vector", queryVector, filters, this.config.contextVectorTopK)
					.catch(() => {
						contextAvailable = false;
						degradedReasons.push("context_vector_unavailable");
						return [];
					});
			}
			const [exact, bm25, item, context] = await Promise.all([
				exactPromise,
				bm25Promise,
				itemPromise,
				contextPromise,
			]);
			retrieveMs += this.nowMs() - retrievalStart;
			const arms = { exact, bm25, item, context } as const;
			const activeArms: BoqRetrievalArm[] = [
				"exact",
				"bm25",
				...(itemAvailable ? ["item" as const] : []),
				...(contextAvailable ? ["context" as const] : []),
			];
			const fused = weightedBoqRrf(arms, weightsFor(parsed, this.config), activeArms, this.config.rrfK).slice(
				0,
				this.config.fusionKeepK,
			);
			if (fused.length === 0) {
				const confidence = boqConfidencePolicy(parsed, [], activeArms, this.config, degradedReasons.length > 0);
				const totalMs = this.nowMs() - started;
				const debug = this.debug(request, filters, armCounts(arms), 0, activeArms, degradedReasons, parsed, {
					parse: parseMs,
					embedding: embeddingMs,
					retrieve: retrieveMs,
					rerank: 0,
					total: totalMs,
				});
				this.trace(request.query, filters, [], totalMs, "OK");
				return { parsedQuery: parsed, confidence, results: [], ...(debug ? { debug } : {}) };
			}

			const candidates = fused.slice(0, this.config.rerankK);
			let rerankScores: readonly number[] | undefined;
			const rerankStart = this.nowMs();
			try {
				rerankScores = await this.options.reranker.score(
					rerankQuery(parsed),
					candidates.map((candidate) => candidate.document),
				);
				if (rerankScores.length !== candidates.length) throw new Error("reranker count mismatch");
			} catch {
				rerankScores = undefined;
				degradedReasons.push("reranker_unavailable");
			}
			rerankMs = this.nowMs() - rerankStart;
			const results = this.rank(parsed, candidates, rerankScores).slice(0, topK);
			const confidence = boqConfidencePolicy(parsed, results, activeArms, this.config, degradedReasons.length > 0);
			const totalMs = this.nowMs() - started;
			const debug = this.debug(
				request,
				filters,
				armCounts(arms),
				fused.length,
				activeArms,
				degradedReasons,
				parsed,
				{ parse: parseMs, embedding: embeddingMs, retrieve: retrieveMs, rerank: rerankMs, total: totalMs },
			);
			this.trace(request.query, filters, results, totalMs, "OK");
			return { parsedQuery: parsed, confidence, results, ...(debug ? { debug } : {}) };
		} catch (cause) {
			const totalMs = this.nowMs() - started;
			this.trace(request.query, filters, [], totalMs, "ERROR");
			if (cause instanceof IndustryAgentError) throw cause;
			throw new IndustryAgentError("RETRIEVAL_ERROR", "BOQ hybrid retrieval failed", { cause });
		}
	}

	private rank(
		query: ParsedBoqQuery,
		candidates: readonly BoqFusedCandidate[],
		rerankScores: readonly number[] | undefined,
	): BoqSearchResult[] {
		const rerankerAvailable = Boolean(rerankScores);
		const results = candidates.map((candidate, index): BoqSearchResult => {
			const business = scoreBoqBusinessFeatures(query, candidate.document);
			const rerank = rerankerAvailable ? clamp01(rerankScores?.[index] ?? 0) : 0;
			const rankingScore = rerankerAvailable
				? clamp01(
						this.config.rankingWeights.rerank * rerank +
							this.config.rankingWeights.fusion * candidate.fusionNorm +
							this.config.rankingWeights.business * business.score,
					)
				: clamp01(
						(this.config.rankingWeights.fusion * candidate.fusionNorm +
							this.config.rankingWeights.business * business.score) /
							(this.config.rankingWeights.fusion + this.config.rankingWeights.business),
					);
			return {
				ledgerId: candidate.document.ledgerId,
				ledgerCode: candidate.document.ledgerCodeNorm,
				ledgerName: candidate.document.ledgerNameNorm,
				...(candidate.document.sectionId ? { sectionId: candidate.document.sectionId } : {}),
				...(candidate.document.sectionName ? { sectionName: candidate.document.sectionName } : {}),
				pathText: candidate.document.pathText,
				...(candidate.document.unitNorm ? { unit: candidate.document.unitNorm } : {}),
				specTokens: candidate.document.specTokens,
				isLeaf: candidate.document.isLeaf,
				hierarchyGap: candidate.document.hierarchyGap,
				rankingScore,
				scoreBreakdown: {
					rerank,
					fusion: candidate.fusionNorm,
					business: business.score,
					businessFeatures: business.features,
					criticalSpecConflicts: business.criticalSpecConflicts,
					conflictPenalty: business.conflictPenalty,
				},
				armSupportCount: Object.keys(candidate.armRanks).length,
				identityScore: business.identityScore,
				filterCoverage: business.filterCoverage,
			};
		});
		return results.sort((left, right) => {
			if (Math.abs(right.rankingScore - left.rankingScore) >= 0.01) return right.rankingScore - left.rankingScore;
			if (left.scoreBreakdown.criticalSpecConflicts !== right.scoreBreakdown.criticalSpecConflicts)
				return left.scoreBreakdown.criticalSpecConflicts - right.scoreBreakdown.criticalSpecConflicts;
			const leftExact = left.scoreBreakdown.businessFeatures.exact_name ?? 0,
				rightExact = right.scoreBreakdown.businessFeatures.exact_name ?? 0;
			if (rightExact !== leftExact) return rightExact - leftExact;
			const leftPath = left.scoreBreakdown.businessFeatures.ancestor_path_match ?? 0,
				rightPath = right.scoreBreakdown.businessFeatures.ancestor_path_match ?? 0;
			if (rightPath !== leftPath) return rightPath - leftPath;
			if ((query.queryMode === "ITEM_SHORT" || query.queryMode === "SPEC") && left.isLeaf !== right.isLeaf)
				return left.isLeaf ? -1 : 1;
			return left.ledgerCode.localeCompare(right.ledgerCode);
		});
	}

	private debug(
		request: BoqSearchRequest,
		filters: BoqSearchFilters,
		counts: Readonly<Record<BoqRetrievalArm, number>>,
		candidateCount: number,
		activeArms: readonly BoqRetrievalArm[],
		degradedReasons: readonly string[],
		parsed: ParsedBoqQuery,
		latencyMs: BoqRetrievalDebug["latencyMs"],
	): BoqRetrievalDebug | undefined {
		if (!request.debug) return undefined;
		return {
			configVersion: this.config.version,
			indexVersion: this.config.indexVersion,
			normalizerVersion: this.config.normalizerVersion,
			embeddingModelVersion: this.options.embedding.modelVersion,
			rerankerModelVersion: this.options.reranker.modelVersion,
			activeArms,
			armCounts: counts,
			candidateCount,
			filters,
			...(parsed.queryMode !== "CODE" ? { weights: weightsFor(parsed, this.config) } : {}),
			degraded: degradedReasons.length > 0,
			degradedReasons: [...degradedReasons],
			latencyMs,
		};
	}

	private trace(
		query: string,
		filters: BoqSearchFilters,
		results: readonly BoqSearchResult[],
		latencyMs: number,
		status: "OK" | "ERROR",
	): void {
		this.options.trace?.recordRetrieval({
			retrievalType: "BOQ_HYBRID",
			status,
			query,
			filters: { ...filters },
			candidates: results.map((result) => ({
				ledgerId: result.ledgerId,
				ledgerCode: result.ledgerCode,
				rankingScore: result.rankingScore,
				criticalSpecConflicts: result.scoreBreakdown.criticalSpecConflicts,
			})),
			indexVersion: this.config.indexVersion,
			modelVersion: this.options.embedding.modelVersion,
			latencyMs,
		});
	}
}
