import type { TraceRetrievalInput } from "../../trace/types.ts";

export type EngineeringQueryMode = "CODE" | "CHAINAGE" | "ENTITY_SHORT" | "CONTEXT" | "DEFAULT";
export type EngineeringAlignmentSide = "LEFT_WIDTH" | "RIGHT_WIDTH" | "LEFT_LINE" | "RIGHT_LINE" | "NONE";
export type EngineeringLocalSide = "LEFT" | "RIGHT" | "BOTH" | "NONE";
export type EngineeringRetrievalArm = "exact" | "bm25" | "name" | "context";

export interface EngineeringQueryHint<T> {
	value: T;
	confidence: number;
	mode: "hard" | "soft";
	source: "user" | "context" | "rule" | "resolver";
}

export interface ParsedEngineeringQuery {
	rawQuery: string;
	semanticQuery: string;
	projectId?: string;
	engineeringCode?: string | undefined;
	unitEngineeringId?: string | undefined;
	unitEngineeringName?: string | undefined;
	engineeringCategoryName?: string | undefined;
	engineeringTypeName?: string | undefined;
	alignmentCode?: string | undefined;
	alignmentSide: EngineeringAlignmentSide;
	localSide: EngineeringLocalSide;
	chainageMode?: "point" | "range" | "nearby";
	chainageStartM?: number | undefined;
	chainageEndM?: number | undefined;
	nearbyRadiusM?: number;
	crossAlignment: boolean;
	positionTokens: readonly string[];
	aliases: readonly string[];
	queryMode: EngineeringQueryMode;
	confidences: Readonly<Record<string, number>>;
	hints: {
		unitEngineeringId?: EngineeringQueryHint<string>;
		unitEngineeringName?: EngineeringQueryHint<string>;
		engineeringCategoryName?: EngineeringQueryHint<string>;
		engineeringTypeName?: EngineeringQueryHint<string>;
	};
}

export interface EngineeringSearchRequest {
	query: string;
	projectId: string;
	topK?: number;
	leafOnly?: boolean | null;
	debug?: boolean;
	hints?: ParsedEngineeringQuery["hints"];
}

export interface EngineeringSearchFilters {
	excludeDeleted: true;
	projectId: string;
	unitEngineeringId?: string | undefined;
	alignmentCode?: string | undefined;
	alignmentSide?: Exclude<EngineeringAlignmentSide, "NONE">;
	engineeringCategoryName?: string | undefined;
	engineeringTypeName?: string | undefined;
	chainageStartM?: number | undefined;
	chainageEndM?: number | undefined;
	crossAlignment?: false;
	leafOnly?: boolean;
}

export type RelaxableEngineeringFilterField = "unitEngineeringId" | "engineeringCategoryName" | "engineeringTypeName";

export interface RelaxableEngineeringFilter {
	field: RelaxableEngineeringFilterField;
	value: unknown;
	confidence: number;
	reason: string;
}

export interface EngineeringFilterPlan {
	filters: EngineeringSearchFilters;
	relaxable: readonly RelaxableEngineeringFilter[];
}

export interface EngineeringSearchDocument {
	engineeringId: string;
	engineeringCode?: string | undefined;
	projectId: string;
	unitEngineeringId?: string | undefined;
	unitEngineeringName?: string | undefined;
	parentEngineeringId?: string | undefined;
	ancestorIds: readonly string[];
	pathNames: readonly string[];
	pathText: string;
	depth: number;
	engineeringName: string;
	engineeringFullName?: string | undefined;
	engineeringCategoryName?: string | undefined;
	engineeringTypeName?: string | undefined;
	alignmentCode?: string | undefined;
	alignmentSide: EngineeringAlignmentSide;
	localSide: EngineeringLocalSide;
	positionTokens: readonly string[];
	aliasTerms: readonly string[];
	chainageStartM?: number | undefined;
	chainageEndM?: number | undefined;
	crossAlignment: boolean;
	isMinUnit: boolean;
	isDeleted: boolean;
	semanticName: string;
	semanticPath: string;
	searchText: string;
	embeddingNameText: string;
	embeddingContextText: string;
	rerankText: string;
	embeddingVersion: string;
	embeddingInputHash: string;
	indexVersion: string;
	nameVector?: readonly number[];
	contextVector?: readonly number[];
}

export type EngineeringExactMatchKind = "ENGINEERING_CODE" | "FULL_NAME" | "NAME" | "ALIAS";

export interface EngineeringArmHit {
	document: EngineeringSearchDocument;
	rawScore?: number | undefined;
	matchedQueries?: readonly string[];
	exactKinds?: readonly EngineeringExactMatchKind[];
}

export interface EngineeringRetrievalBackend {
	searchExact(
		query: ParsedEngineeringQuery,
		filters: EngineeringSearchFilters,
		topK: number,
	): Promise<readonly EngineeringArmHit[]>;
	searchBm25(
		query: ParsedEngineeringQuery,
		filters: EngineeringSearchFilters,
		topK: number,
	): Promise<readonly EngineeringArmHit[]>;
	searchDense(
		field: "name_vector" | "context_vector",
		queryVector: readonly number[],
		filters: EngineeringSearchFilters,
		topK: number,
	): Promise<readonly EngineeringArmHit[]>;
}

export interface EngineeringEmbeddingProvider {
	readonly modelVersion: string;
	readonly dimension: number;
	embed(text: string): Promise<readonly number[]>;
}

export interface EngineeringReranker {
	readonly modelVersion: string;
	score(query: string, candidates: readonly EngineeringSearchDocument[]): Promise<readonly number[]>;
}

export interface EngineeringRetrievalTraceSink {
	recordRetrieval(input: TraceRetrievalInput): void;
}

export interface EngineeringRrfWeights {
	exact: number;
	bm25: number;
	name: number;
	context: number;
}

export interface EngineeringRetrievalConfig {
	version: string;
	indexName: string;
	indexVersion: string;
	embeddingModel: string;
	embeddingDimension: number;
	exactTopK: number;
	bm25TopK: number;
	nameVectorTopK: number;
	contextVectorTopK: number;
	fusionKeepK: number;
	rrfK: number;
	rerankK: number;
	finalTopK: number;
	defaultNearbyRadiusM: number;
	weights: Readonly<Record<Exclude<EngineeringQueryMode, "CODE">, EngineeringRrfWeights>>;
	finalScoreWeights: { rerank: number; fusion: number; business: number };
	confidence: { autoAcceptScore: number; autoAcceptMargin: number; ambiguousFloor: number };
}

export interface EngineeringFusedCandidate {
	document: EngineeringSearchDocument;
	fusionScore: number;
	armRanks: Partial<Record<EngineeringRetrievalArm, number>>;
	armContributions: Partial<Record<EngineeringRetrievalArm, number>>;
}

export interface EngineeringScoreBreakdown {
	rerank: number;
	fusion: number;
	business: number;
	businessFeatures: Readonly<Record<string, number>>;
}

export interface EngineeringSearchResult {
	engineeringId: string;
	engineeringName: string;
	unitEngineeringName?: string | undefined;
	pathText: string;
	engineeringCategoryName?: string | undefined;
	engineeringTypeName?: string | undefined;
	alignmentCode?: string | undefined;
	alignmentSide: EngineeringAlignmentSide;
	chainageStartM?: number | undefined;
	chainageEndM?: number | undefined;
	finalScore: number;
	scoreBreakdown: EngineeringScoreBreakdown;
}

export interface EngineeringSearchConfidence {
	autoAccept: boolean;
	level: "EXACT" | "HIGH" | "AMBIGUOUS" | "LOW" | "NONE";
	top1Score?: number;
	margin?: number;
	recommendedResultCount: number;
	reason: string;
}

export interface EngineeringRetrievalDebug {
	configVersion: string;
	indexVersion: string;
	embeddingModelVersion: string;
	rerankerModelVersion: string;
	armCounts: Readonly<Record<EngineeringRetrievalArm, number>>;
	candidateCount: number;
	relaxedFilters: readonly string[];
	filters: EngineeringSearchFilters;
	weights?: EngineeringRrfWeights;
	latencyMs: Readonly<Record<"parse" | "embedding" | "retrieve" | "rerank" | "total", number>>;
}

export interface EngineeringSearchResponse {
	parsedQuery: ParsedEngineeringQuery;
	confidence: EngineeringSearchConfidence;
	results: readonly EngineeringSearchResult[];
	debug?: EngineeringRetrievalDebug;
}

export interface EngineeringBenchmarkObservation {
	expectedEngineeringIds: readonly string[];
	rankedEngineeringIds: readonly string[];
	constraintConflict: boolean;
	latencyMs: number;
}

export interface EngineeringBenchmarkMetrics {
	queryCount: number;
	recallAt20: number;
	recallAt50: number;
	hitAt1: number;
	mrr: number;
	zeroResultRate: number;
	constraintConflictRate: number;
	p50LatencyMs: number;
	p95LatencyMs: number;
}
