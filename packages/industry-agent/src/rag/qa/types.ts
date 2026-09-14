import type { JsonObject, RequestContext } from "../../contracts/index.ts";
import type { RagChunkRecord, RagDocumentRecord, RagKnowledgeScope } from "../ingestion/types.ts";

export interface RagQaAccessContext {
	userId: string;
	tenantId: string;
	companyId: string | null;
	projectId: string | null;
	industryId: string | null;
	departmentId: string | null;
	roles: readonly string[];
	securityTags: readonly string[];
}

export interface RagQaResolvedContext {
	question: string;
	entityIds: readonly string[];
	metadataHints?: JsonObject;
}

export interface RagQaMetadataFilter {
	documentIds?: readonly string[];
	mimeTypes?: readonly string[];
	entityIds?: readonly string[];
	sectionPrefix?: readonly string[];
}

export interface RagQaRequest {
	context: RequestContext;
	question: string;
	metadataFilter?: RagQaMetadataFilter;
	debug?: boolean;
}

export interface RagQaAccessFilter extends RagQaAccessContext {
	aclPolicyVersion: string;
	metadataFilter: RagQaMetadataFilter;
	requireReady: true;
}

export interface RagQaSearchCandidate {
	chunk: RagChunkRecord;
	document: RagDocumentRecord;
	score: number;
	rank?: number;
	arm: RagQaRetrievalArm;
}

export type RagQaRetrievalArm = "BM25" | "DENSE" | "ENTITY";

export interface RagQaRetrievalBackend {
	bm25(query: string, filter: RagQaAccessFilter, topK: number): Promise<readonly RagQaSearchCandidate[]>;
	dense(vector: readonly number[], filter: RagQaAccessFilter, topK: number): Promise<readonly RagQaSearchCandidate[]>;
	entityAware?(
		query: string,
		entityIds: readonly string[],
		filter: RagQaAccessFilter,
		topK: number,
	): Promise<readonly RagQaSearchCandidate[]>;
}

export interface RagQaAccessContextProvider {
	resolve(context: RequestContext): Promise<RagQaAccessContext>;
}

export interface RagQaContextResolver {
	resolve(input: { context: RequestContext; question: string }): Promise<RagQaResolvedContext>;
}

export interface RagQaQueryRewriter {
	readonly version: string;
	rewrite(input: RagQaResolvedContext): Promise<string>;
}

export interface RagQaEmbeddingProvider {
	readonly version: string;
	readonly dimension: number;
	embedQuery(text: string): Promise<readonly number[]>;
}

export interface RagQaReranker {
	readonly version: string;
	rerank(query: string, candidates: readonly RagQaFusedCandidate[]): Promise<readonly RagQaRerankScore[]>;
}

export interface RagQaRerankScore {
	chunkId: string;
	score: number;
}

export interface RagQaFusedCandidate {
	chunk: RagChunkRecord;
	document: RagDocumentRecord;
	rrfScore: number;
	rrfNorm: number;
	arms: readonly RagQaRetrievalArm[];
	armRanks: Readonly<Partial<Record<RagQaRetrievalArm, number>>>;
}

export interface RagQaRankedCandidate extends RagQaFusedCandidate {
	rerankScore: number;
	finalScore: number;
}

export interface RagQaSourceReader {
	getChunk(chunkId: string, filter: RagQaAccessFilter): Promise<RagChunkRecord | undefined>;
	getDocument(documentId: string, filter: RagQaAccessFilter): Promise<RagDocumentRecord | undefined>;
}

export interface RagQaCitation {
	citationId: string;
	documentId: string;
	chunkId: string;
	page: number | null;
	pageStart: number;
	pageEnd: number;
	section: string;
	sectionPath: readonly string[];
	quote: string;
	sourceVersion: string;
	parserVersion?: string;
	chunkerVersion: string;
	embeddingVersion: string;
	lexicalIndexVersion: string;
	vectorIndexVersion: string;
}

export interface RagQaEvidenceItem {
	candidate: RagQaRankedCandidate;
	contextText: string;
	parentChunkId?: string;
	citation: RagQaCitation;
	parentCitation?: RagQaCitation;
}

export type RagQaAnswerStatus = "ANSWERED" | "INSUFFICIENT_EVIDENCE";

export interface RagQaAnswerGeneratorInput {
	question: string;
	rewrittenQuery: string;
	evidence: readonly RagQaEvidenceItem[];
	groundingRule: "EVIDENCE_ONLY";
	allowedCitationIds: readonly string[];
}

export interface RagQaAnswerGenerator {
	generate(input: RagQaAnswerGeneratorInput): Promise<string>;
}

export interface RagQaDebug {
	context: RagQaResolvedContext;
	rewrittenQuery: string;
	accessSummary: {
		tenantId: string;
		companyId: string | null;
		projectId: string | null;
		industryId: string | null;
		departmentId: string | null;
		aclPolicyVersion: string;
		metadataFilter: RagQaMetadataFilter;
	};
	armCounts: Readonly<Partial<Record<RagQaRetrievalArm, number>>>;
	fusedCount: number;
	rerankedCount: number;
	evidenceCount: number;
	degraded: readonly string[];
}

export interface RagQaResult {
	status: RagQaAnswerStatus;
	answer: string;
	citations: readonly RagQaCitation[];
	debug?: RagQaDebug;
}

export interface RagQaTraceEvent {
	traceId: string;
	requestId: string;
	stage:
		| "CONTEXT"
		| "REWRITE"
		| "ACCESS_FILTER"
		| "RETRIEVAL"
		| "RRF"
		| "RERANK"
		| "DIVERSITY"
		| "PARENT_EXPANSION"
		| "CITATION"
		| "ANSWER";
	status: "OK" | "DEGRADED" | "ERROR";
	details?: JsonObject;
}

export interface RagQaTraceSink {
	record(event: RagQaTraceEvent): void;
}

export interface RagQaConfig {
	version: string;
	aclPolicyVersion: string;
	bm25TopK: number;
	denseTopK: number;
	entityTopK: number;
	fusionKeepK: number;
	rrfK: number;
	armWeights: Readonly<Record<RagQaRetrievalArm, number>>;
	rerankK: number;
	finalK: number;
	maxPerDocument: number;
	parentExpansionChars: number;
	minTopRerankScore: number;
	minEvidenceCount: number;
	insufficientEvidenceText: string;
}

export interface RagQaServiceOptions {
	access: RagQaAccessContextProvider;
	contextResolver: RagQaContextResolver;
	rewriter: RagQaQueryRewriter;
	embedding: RagQaEmbeddingProvider;
	retrieval: RagQaRetrievalBackend;
	reranker: RagQaReranker;
	sources: RagQaSourceReader;
	answerGenerator: RagQaAnswerGenerator;
	config: RagQaConfig;
	trace?: RagQaTraceSink;
}

export interface RagQaCorpusEntry {
	document: RagDocumentRecord;
	chunk: RagChunkRecord;
	vector?: readonly number[];
}

export function scopeFromDocument(document: RagDocumentRecord): RagKnowledgeScope {
	return document.scope;
}
