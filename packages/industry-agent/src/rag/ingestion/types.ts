import type { JsonObject, RequestContext } from "../../contracts/index.ts";

export type RagVisibility = "PRIVATE" | "PROJECT" | "COMPANY" | "INDUSTRY" | "TENANT";
export type RagDocumentStatus =
	| "RECEIVED"
	| "VALIDATING"
	| "STORED"
	| "PARSING"
	| "EXTRACTING"
	| "CHUNKING"
	| "ENRICHING"
	| "EMBEDDING"
	| "INDEXING"
	| "QUALITY_VALIDATING"
	| "READY"
	| "DEDUPLICATED"
	| "FAILED";
export type RagPipelineStage = Exclude<RagDocumentStatus, "READY" | "DEDUPLICATED" | "FAILED">;
export type RagBlockType = "TITLE" | "HEADING" | "CLAUSE" | "PARAGRAPH" | "TABLE" | "LIST" | "IMAGE" | "CAPTION";
export type RagChunkType = RagBlockType | "WINDOW";

export interface RagKnowledgeScope {
	tenantId: string;
	industryId: string | null;
	companyId: string | null;
	projectId: string | null;
	departmentId: string | null;
	ownerUserId: string;
	visibility: RagVisibility;
	aclUsers: readonly string[];
	aclRoles: readonly string[];
	securityTags: readonly string[];
}

export interface RagUploadFile {
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	content: Uint8Array;
}

export interface RagIngestionRequest {
	context: RequestContext;
	file: RagUploadFile;
	scope: RagKnowledgeScope;
	metadata?: JsonObject;
}

export interface RagIngestionVersions {
	parserVersion: string;
	chunkerVersion: string;
	embeddingVersion: string;
	lexicalIndexVersion: string;
	vectorIndexVersion: string;
	visionVersion?: string;
}

export interface RagFailureInfo {
	stage: RagPipelineStage;
	code: string;
	message: string;
	retriable: boolean;
	failedAt: string;
}

export interface RagDocumentRecord {
	documentId: string;
	traceId: string;
	requestId: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	checksumSha256: string;
	storageKey?: string;
	status: RagDocumentStatus;
	scope: RagKnowledgeScope;
	scopeFingerprint: string;
	metadata: JsonObject;
	versions: Partial<RagIngestionVersions>;
	chunkCount: number;
	duplicateOfDocumentId?: string;
	failure?: RagFailureInfo;
	createdAt: string;
	updatedAt: string;
	readyAt?: string;
}

export interface RagExtractedBlock {
	blockId: string;
	parentBlockId?: string;
	type: RagBlockType;
	text: string;
	sectionPath: readonly string[];
	pageStart: number;
	pageEnd: number;
	level?: number;
	metadata?: JsonObject;
}

export interface RagParsedDocument {
	parserVersion: string;
	blocks: readonly RagExtractedBlock[];
	requiresVision: boolean;
	metadata?: JsonObject;
}

export interface RagVisionResult {
	visionVersion: string;
	blocks: readonly RagExtractedBlock[];
}

export interface RagChunkDraft {
	chunkId: string;
	documentId: string;
	parentChunkId?: string;
	sourceBlockId: string;
	ordinal: number;
	type: RagChunkType;
	text: string;
	sectionPath: readonly string[];
	pageStart: number;
	pageEnd: number;
	metadata: JsonObject;
}

export interface RagChunkRecord extends RagChunkDraft {
	scope: RagKnowledgeScope;
	scopeFingerprint: string;
	contentHash: string;
	entityIds: readonly string[];
	chunkerVersion: string;
	embeddingVersion: string;
	lexicalIndexVersion: string;
	vectorIndexVersion: string;
}

export interface RagChunkEnrichment {
	entityIds: readonly string[];
	metadata?: JsonObject;
}

export interface RagIngestionResult {
	document: RagDocumentRecord;
	chunks: readonly RagChunkRecord[];
	deduplicated: boolean;
}

export interface RagPermissionInput {
	context: RequestContext;
	scope: RagKnowledgeScope;
	permission: "knowledge.ingest";
}
export interface RagPermissionService { authorize(input: RagPermissionInput): Promise<boolean>; }

export interface RagObjectStorage {
	putIfAbsent(key: string, content: Uint8Array, metadata: JsonObject): Promise<{ storageKey: string; reused: boolean }>;
}

export interface RagParser {
	readonly parserVersion: string;
	supports(mimeType: string, fileName: string): boolean;
	parse(file: RagUploadFile): Promise<RagParsedDocument>;
}
export interface RagParserRouter { resolve(mimeType: string, fileName: string): RagParser | undefined; }
export interface RagVisionExtractor { readonly version: string; extract(file: RagUploadFile, parsed: RagParsedDocument): Promise<RagVisionResult>; }

export interface RagTokenWindow {
	count(text: string): number;
	split(text: string, maxTokens: number, overlapTokens: number): readonly string[];
}

export interface RagChunkerConfig { maxSectionTokens: number; overlapTokens: number; }
export interface RagChunker {
	readonly version: string;
	chunk(documentId: string, blocks: readonly RagExtractedBlock[]): readonly RagChunkDraft[];
}

export interface RagEnricher {
	enrich(document: RagDocumentRecord, chunks: readonly RagChunkDraft[]): Promise<readonly RagChunkEnrichment[]>;
}

export interface RagEmbeddingProvider {
	readonly version: string;
	readonly dimension: number;
	embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface RagLexicalIndex {
	readonly version: string;
	stage(document: RagDocumentRecord, chunks: readonly RagChunkRecord[]): Promise<{ indexedChunkIds: readonly string[] }>;
	activate(documentId: string): Promise<void>;
	remove(documentId: string): Promise<void>;
}
export interface RagVectorIndex {
	readonly version: string;
	stage(document: RagDocumentRecord, chunks: readonly RagChunkRecord[], vectors: readonly (readonly number[])[]): Promise<{ indexedChunkIds: readonly string[] }>;
	activate(documentId: string): Promise<void>;
	remove(documentId: string): Promise<void>;
}

export interface RagQualityInput {
	document: RagDocumentRecord;
	chunks: readonly RagChunkRecord[];
	vectors: readonly (readonly number[])[];
	lexicalIndexedIds: readonly string[];
	vectorIndexedIds: readonly string[];
	expectedEmbeddingDimension: number;
}
export interface RagQualityValidator { validate(input: RagQualityInput): void; }

export interface RagDocumentRepository {
	create(document: RagDocumentRecord): Promise<void>;
	update(document: RagDocumentRecord): Promise<void>;
	get(documentId: string): Promise<RagDocumentRecord | undefined>;
	findReadyByChecksum(checksumSha256: string, scope: RagKnowledgeScope): Promise<RagDocumentRecord | undefined>;
}
export interface RagChunkRepository {
	replaceForDocument(documentId: string, chunks: readonly RagChunkRecord[]): Promise<void>;
	listByDocument(documentId: string): Promise<readonly RagChunkRecord[]>;
}

export interface RagIngestionTraceSink {
	record(event: { traceId: string; requestId: string; documentId: string; stage: RagDocumentStatus; status: "START" | "OK" | "ERROR"; details?: JsonObject }): void;
}

export interface RagIngestionServiceOptions {
	permissions: RagPermissionService;
	documents: RagDocumentRepository;
	chunks: RagChunkRepository;
	storage: RagObjectStorage;
	parsers: RagParserRouter;
	vision?: RagVisionExtractor;
	chunker: RagChunker;
	enricher: RagEnricher;
	embedding: RagEmbeddingProvider;
	lexicalIndex: RagLexicalIndex;
	vectorIndex: RagVectorIndex;
	quality: RagQualityValidator;
	trace?: RagIngestionTraceSink;
	now?: () => Date;
	idFactory?: () => string;
	maxFileSizeBytes?: number;
	allowedMimeTypes?: readonly string[];
}
