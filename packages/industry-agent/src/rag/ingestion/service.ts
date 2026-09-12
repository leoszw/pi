import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../contracts/index.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { sha256Bytes, sha256Text } from "./checksum.ts";
import { ragScopeFingerprint, validateRagScope } from "./scope.ts";
import { assertRagTransition } from "./state-machine.ts";
import type {
	RagChunkRecord, RagDocumentRecord, RagDocumentStatus, RagExtractedBlock, RagFailureInfo, RagIngestionRequest, RagIngestionResult,
	RagIngestionServiceOptions, RagPipelineStage,
} from "./types.ts";

function errorCode(error: unknown): string { return error instanceof IndustryAgentError ? error.code : "RAG_INGESTION_FAILED"; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function retriable(error: unknown): boolean { return !(error instanceof IndustryAgentError && ["RAG_SCOPE_INVALID", "RAG_FILE_INVALID", "RAG_PARSER_NOT_FOUND", "RAG_QUALITY_FAILED"].includes(error.code)); }
function mergeBlocks(base: readonly RagExtractedBlock[], extra: readonly RagExtractedBlock[]): readonly RagExtractedBlock[] {
	const seen = new Set<string>(); const output: RagExtractedBlock[] = [];
	for (const block of [...base, ...extra]) { if (seen.has(block.blockId)) continue; seen.add(block.blockId); output.push(block); }
	return output;
}

export class RagIngestionService {
	private readonly options: RagIngestionServiceOptions;
	private readonly now: () => Date;
	private readonly idFactory: () => string;
	private readonly maxFileSizeBytes: number;
	private readonly allowedMimeTypes: readonly string[];
	constructor(options: RagIngestionServiceOptions) {
		this.options = options; this.now = options.now ?? (() => new Date()); this.idFactory = options.idFactory ?? (() => randomUUID());
		this.maxFileSizeBytes = options.maxFileSizeBytes ?? 50 * 1024 * 1024;
		this.allowedMimeTypes = options.allowedMimeTypes ?? ["application/pdf", "text/plain", "text/markdown", "text/html", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
	}

	async ingest(request: RagIngestionRequest): Promise<RagIngestionResult> {
		const scope = validateRagScope(request.context, request.scope);
		const documentId = this.idFactory(); const now = this.now().toISOString(); const checksum = sha256Bytes(request.file.content); const scopeFingerprint = sha256Text(ragScopeFingerprint(scope));
		let document: RagDocumentRecord = {
			documentId, traceId: request.context.traceId, requestId: request.context.requestId, fileName: request.file.fileName,
			mimeType: request.file.mimeType, sizeBytes: request.file.sizeBytes, checksumSha256: checksum, status: "RECEIVED", scope,
			scopeFingerprint, metadata: structuredClone(request.metadata ?? {}), versions: {}, chunkCount: 0, createdAt: now, updatedAt: now,
		};
		await this.options.documents.create(document); this.trace(document, "RECEIVED", "OK");
		let stage: RagPipelineStage = "VALIDATING";
		try {
			document = await this.transition(document, "VALIDATING");
			this.validateFile(request.file.fileName, request.file.mimeType, request.file.sizeBytes, request.file.content.length);
			const allowed = await this.options.permissions.authorize({ context: request.context, scope, permission: "knowledge.ingest" });
			if (!allowed) throw new IndustryAgentError("RAG_ACCESS_DENIED", "Permission denied: knowledge.ingest");
			const duplicate = await this.options.documents.findReadyByChecksum(checksum, scope);
			if (duplicate) {
				document = await this.transition(document, "DEDUPLICATED", { duplicateOfDocumentId: duplicate.documentId, versions: duplicate.versions, chunkCount: duplicate.chunkCount, readyAt: this.now().toISOString() });
				return { document, chunks: await this.options.chunks.listByDocument(duplicate.documentId), deduplicated: true };
			}

			stage = "STORED";
			const storage = await this.options.storage.putIfAbsent(`rag/${scope.tenantId}/${checksum}`, request.file.content, { fileName: request.file.fileName, mimeType: request.file.mimeType, checksumSha256: checksum });
			document = await this.transition(document, "STORED", { storageKey: storage.storageKey });

			stage = "PARSING"; document = await this.transition(document, "PARSING");
			const parser = this.options.parsers.resolve(request.file.mimeType, request.file.fileName);
			if (!parser) throw new IndustryAgentError("RAG_PARSER_NOT_FOUND", `No parser registered for ${request.file.mimeType}`);
			const parsed = await parser.parse(request.file);
			document = await this.patch(document, { versions: { ...document.versions, parserVersion: parsed.parserVersion } });

			stage = "EXTRACTING"; document = await this.transition(document, "EXTRACTING");
			let blocks = parsed.blocks;
			if (parsed.requiresVision) {
				if (!this.options.vision) throw new IndustryAgentError("RAG_VISION_REQUIRED", "Parser requested OCR/vision but no vision extractor is configured");
				const vision = await this.options.vision.extract(request.file, parsed); blocks = mergeBlocks(blocks, vision.blocks);
				document = await this.patch(document, { versions: { ...document.versions, visionVersion: vision.visionVersion } });
			}

			stage = "CHUNKING"; document = await this.transition(document, "CHUNKING");
			const drafts = this.options.chunker.chunk(documentId, blocks);
			document = await this.patch(document, { versions: { ...document.versions, chunkerVersion: this.options.chunker.version } });

			stage = "ENRICHING"; document = await this.transition(document, "ENRICHING");
			const enrichments = await this.options.enricher.enrich(document, drafts);
			if (enrichments.length !== drafts.length) throw new IndustryAgentError("RAG_INGESTION_FAILED", "Enricher result count does not match chunk count");

			stage = "EMBEDDING"; document = await this.transition(document, "EMBEDDING");
			const vectors = await this.options.embedding.embed(drafts.map((chunk) => chunk.text));
			if (vectors.length !== drafts.length) throw new IndustryAgentError("RAG_INGESTION_FAILED", "Embedding result count does not match chunk count");
			const versions = {
				...document.versions, embeddingVersion: this.options.embedding.version,
				lexicalIndexVersion: this.options.lexicalIndex.version, vectorIndexVersion: this.options.vectorIndex.version,
			};
			document = await this.patch(document, { versions });
			const chunks: RagChunkRecord[] = drafts.map((draft, index) => ({
				...draft, scope: structuredClone(scope), scopeFingerprint, contentHash: sha256Text(draft.text), entityIds: [...(enrichments[index]?.entityIds ?? [])],
				metadata: { ...draft.metadata, ...(enrichments[index]?.metadata ?? {}) }, chunkerVersion: this.options.chunker.version,
				embeddingVersion: this.options.embedding.version, lexicalIndexVersion: this.options.lexicalIndex.version, vectorIndexVersion: this.options.vectorIndex.version,
			}));
			await this.options.chunks.replaceForDocument(documentId, chunks);

			stage = "INDEXING"; document = await this.transition(document, "INDEXING");
			const [lexical, vector] = await Promise.all([this.options.lexicalIndex.stage(document, chunks), this.options.vectorIndex.stage(document, chunks, vectors)]);

			stage = "QUALITY_VALIDATING"; document = await this.transition(document, "QUALITY_VALIDATING");
			this.options.quality.validate({ document, chunks, vectors, lexicalIndexedIds: lexical.indexedChunkIds, vectorIndexedIds: vector.indexedChunkIds, expectedEmbeddingDimension: this.options.embedding.dimension });
			await Promise.all([this.options.lexicalIndex.activate(documentId), this.options.vectorIndex.activate(documentId)]);
			document = await this.transition(document, "READY", { chunkCount: chunks.length, readyAt: this.now().toISOString() });
			return { document, chunks, deduplicated: false };
		} catch (error) {
			const failure: RagFailureInfo = { stage, code: errorCode(error), message: errorMessage(error), retriable: retriable(error), failedAt: this.now().toISOString() };
			if (document.status !== "FAILED" && document.status !== "READY" && document.status !== "DEDUPLICATED") {
				if (["INDEXING", "QUALITY_VALIDATING"].includes(document.status)) await Promise.allSettled([this.options.lexicalIndex.remove(documentId), this.options.vectorIndex.remove(documentId)]);
				assertRagTransition(document.status, "FAILED"); document = await this.patch(document, { status: "FAILED", failure }); this.trace(document, "FAILED", "ERROR", { stage, code: failure.code, message: failure.message });
			}
			throw error;
		}
	}

	private validateFile(fileName: string, mimeType: string, declaredSize: number, actualSize: number): void {
		if (!fileName.trim() || !mimeType.trim()) throw new IndustryAgentError("RAG_FILE_INVALID", "fileName and mimeType are required");
		if (declaredSize !== actualSize || actualSize <= 0) throw new IndustryAgentError("RAG_FILE_INVALID", "File size metadata does not match uploaded content");
		if (actualSize > this.maxFileSizeBytes) throw new IndustryAgentError("RAG_FILE_INVALID", `File exceeds maximum size ${this.maxFileSizeBytes}`);
		if (!this.allowedMimeTypes.includes(mimeType)) throw new IndustryAgentError("RAG_FILE_INVALID", `Unsupported MIME type: ${mimeType}`);
	}
	private async transition(document: RagDocumentRecord, status: RagDocumentStatus, patch: Partial<RagDocumentRecord> = {}): Promise<RagDocumentRecord> {
		assertRagTransition(document.status, status); this.trace(document, status, "START");
		const updated = await this.patch(document, { ...patch, status }); this.trace(updated, status, "OK"); return updated;
	}
	private async patch(document: RagDocumentRecord, patch: Partial<RagDocumentRecord>): Promise<RagDocumentRecord> {
		const updated: RagDocumentRecord = { ...document, ...patch, updatedAt: this.now().toISOString() }; await this.options.documents.update(updated); return updated;
	}
	private trace(document: RagDocumentRecord, stage: RagDocumentStatus, status: "START" | "OK" | "ERROR", details?: JsonObject): void {
		this.options.trace?.record({ traceId: document.traceId, requestId: document.requestId, documentId: document.documentId, stage, status, ...(details ? { details } : {}) });
	}
}
