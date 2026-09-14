import type { TraceRetrievalInput } from "../../trace/types.ts";

export type BoqOperation = "SEARCH" | "LIST_DESCENDANTS" | "FACT_LOOKUP";
export type BoqQueryMode = "CODE" | "SPEC" | "ITEM_SHORT" | "CONTEXT" | "DEFAULT";
export type BoqRetrievalArm = "exact" | "bm25" | "item" | "context";
export type BoqSpecFamily =
	| "concrete_grade"
	| "rebar_grade"
	| "diameter"
	| "thickness"
	| "percentage"
	| "rock_class"
	| (string & {});

export interface BoqSpecToken {
	family: BoqSpecFamily;
	value: string;
	confidence: number;
	matchedText?: string;
}

export interface BoqQueryCatalog {
	knownCodes: ReadonlySet<string>;
	knownAncestorCodes: ReadonlySet<string>;
	sections?: readonly { sectionId: string; sectionName: string; aliases?: readonly string[] }[];
}

export interface ParsedBoqQuery {
	rawQuery: string;
	semanticQuery: string;
	operation: BoqOperation;
	queryMode: BoqQueryMode;
	projectId: string;
	sectionId?: string;
	sectionName?: string;
	ledgerCode?: string;
	ancestorCode?: string;
	ledgerName?: string;
	ledgerNameNorm?: string;
	unit?: string;
	specTokens: readonly BoqSpecToken[];
	aliases: readonly string[];
	factFields: readonly string[];
	confidences: Readonly<Record<string, number>>;
}

export interface BoqSearchRequest {
	query: string;
	projectId: string;
	topK?: number;
	leafOnly?: boolean | null;
	debug?: boolean;
	catalog: BoqQueryCatalog;
}

export interface BoqSearchFilters {
	excludeDeleted: true;
	projectId: string;
	sectionId?: string;
	sectionName?: string;
	leafOnly?: boolean;
}

export interface BoqSearchDocument {
	ledgerId: string;
	projectId: string;
	sectionId?: string;
	sectionName?: string;
	ledgerCodeRaw: string;
	ledgerCodeNorm: string;
	codeSegments: readonly string[];
	parentCode?: string;
	ancestorCodes: readonly string[];
	existingAncestorCodes: readonly string[];
	missingAncestorCodes: readonly string[];
	hierarchyGap: boolean;
	depth: number;
	hasChildren: boolean;
	isLeaf: boolean;
	ledgerNameRaw: string;
	ledgerNameNorm: string;
	unitRaw?: string;
	unitNorm?: string;
	pathNames: readonly string[];
	pathText: string;
	specTokens: readonly string[];
	specFamilies: readonly string[];
	aliasTerms: readonly string[];
	searchText: string;
	embeddingItemText: string;
	embeddingContextText: string;
	rerankText: string;
	embeddingVersion: string;
	normalizerVersion: string;
	aliasVersion: string;
	specPatternVersion: string;
	embeddingInputHash: string;
	indexVersion: string;
	isDeleted: boolean;
	itemVector?: readonly number[];
	contextVector?: readonly number[];
}

export type BoqExactMatchKind = "LEDGER_CODE" | "NAME" | "ALIAS" | "SPEC";

export interface BoqArmHit {
	document: BoqSearchDocument;
	rawScore?: number;
	exactKinds?: readonly BoqExactMatchKind[];
	matchedQueries?: readonly string[];
}

export interface BoqRetrievalBackend {
	searchExactCode(query: ParsedBoqQuery, filters: BoqSearchFilters): Promise<readonly BoqArmHit[]>;
	listDescendants(query: ParsedBoqQuery, filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]>;
	searchExact(query: ParsedBoqQuery, filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]>;
	searchBm25(query: ParsedBoqQuery, filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]>;
	searchDense(
		field: "item_vector" | "context_vector",
		queryVector: readonly number[],
		filters: BoqSearchFilters,
		topK: number,
	): Promise<readonly BoqArmHit[]>;
}

export interface BoqEmbeddingProvider {
	readonly modelVersion: string;
	readonly dimension: number;
	embed(text: string): Promise<readonly number[]>;
}

export interface BoqReranker {
	readonly modelVersion: string;
	score(query: string, candidates: readonly BoqSearchDocument[]): Promise<readonly number[]>;
}

export interface BoqRetrievalTraceSink {
	recordRetrieval(input: TraceRetrievalInput): void;
}

export interface BoqRrfWeights {
	exact: number;
	bm25: number;
	item: number;
	context: number;
}

export interface BoqRetrievalConfig {
	version: string;
	indexName: string;
	indexVersion: string;
	embeddingModel: string;
	embeddingVersion: string;
	embeddingDimension: number;
	normalizerVersion: string;
	aliasVersion: string;
	specPatternVersion: string;
	exactTopK: number;
	bm25TopK: number;
	itemVectorTopK: number;
	contextVectorTopK: number;
	fusionKeepK: number;
	rrfK: number;
	rerankK: number;
	finalTopK: number;
	weights: Readonly<Record<Exclude<BoqQueryMode, "CODE">, BoqRrfWeights>>;
	rankingWeights: { rerank: number; fusion: number; business: number };
	confidence: { autoAcceptRaw: number; maxCriticalSpecConflicts: number };
}

export interface BoqFusedCandidate {
	document: BoqSearchDocument;
	fusionScore: number;
	fusionNorm: number;
	armRanks: Partial<Record<BoqRetrievalArm, number>>;
	armContributions: Partial<Record<BoqRetrievalArm, number>>;
}

export interface BoqBusinessScore {
	score: number;
	positiveScore: number;
	conflictPenalty: number;
	criticalSpecConflicts: number;
	features: Readonly<Record<string, number>>;
	identityScore: number;
	filterCoverage: number;
}

export interface BoqScoreBreakdown {
	rerank: number;
	fusion: number;
	business: number;
	businessFeatures: Readonly<Record<string, number>>;
	criticalSpecConflicts: number;
	conflictPenalty: number;
}

export interface BoqSearchResult {
	ledgerId: string;
	ledgerCode: string;
	ledgerName: string;
	sectionId?: string;
	sectionName?: string;
	pathText: string;
	unit?: string;
	specTokens: readonly string[];
	isLeaf: boolean;
	hierarchyGap: boolean;
	rankingScore: number;
	scoreBreakdown: BoqScoreBreakdown;
	armSupportCount: number;
	identityScore: number;
	filterCoverage: number;
}

export interface BoqSearchConfidence {
	autoAccept: boolean;
	level: "EXACT" | "HIGH" | "AMBIGUOUS" | "LOW" | "NONE";
	raw: number;
	reason: string;
	recommendedResultCount: number;
}

export interface BoqRetrievalDebug {
	configVersion: string;
	indexVersion: string;
	normalizerVersion: string;
	embeddingModelVersion: string;
	rerankerModelVersion: string;
	activeArms: readonly BoqRetrievalArm[];
	armCounts: Readonly<Record<BoqRetrievalArm, number>>;
	candidateCount: number;
	filters: BoqSearchFilters;
	weights?: BoqRrfWeights;
	degraded: boolean;
	degradedReasons: readonly string[];
	latencyMs: Readonly<Record<"parse" | "embedding" | "retrieve" | "rerank" | "total", number>>;
}

export interface BoqSearchResponse {
	parsedQuery: ParsedBoqQuery;
	confidence: BoqSearchConfidence;
	results: readonly BoqSearchResult[];
	debug?: BoqRetrievalDebug;
}

export interface BoqBenchmarkObservation {
	expectedLedgerIds: readonly string[];
	rankedLedgerIds: readonly string[];
	operation: BoqOperation;
	queryMode: BoqQueryMode;
	codeExactExpected?: boolean;
	hierarchyExpectedCount?: number;
	criticalSpecConflictTop1: boolean;
	autoAccept: boolean;
	autoAcceptCorrect: boolean;
	latencyMs: number;
}

export interface BoqBenchmarkMetrics {
	queryCount: number;
	codeExactAccuracy: number;
	hierarchyAccuracy: number;
	recallAt10: number;
	hitAt1: number;
	mrr: number;
	specConflictTop1Rate: number;
	ambiguityPrecision: number;
	zeroResultRate: number;
	p50LatencyMs: number;
	p95LatencyMs: number;
}
