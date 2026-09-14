import type { JsonObject } from "../../contracts/index.ts";
import { ragScopeFingerprint } from "./scope.ts";
import type {
	RagChunkRecord,
	RagChunkRepository,
	RagDocumentRecord,
	RagDocumentRepository,
	RagIngestionTraceSink,
	RagKnowledgeScope,
	RagLexicalIndex,
	RagObjectStorage,
	RagPermissionInput,
	RagPermissionService,
	RagVectorIndex,
} from "./types.ts";

export class InMemoryRagPermissionService implements RagPermissionService {
	private readonly allowed = new Set<string>();
	allow(input: Omit<RagPermissionInput, "context"> & { userId: string }): void {
		this.allowed.add(
			`${input.userId}|${input.scope.tenantId}|${ragScopeFingerprint(input.scope)}|${input.permission}`,
		);
	}
	async authorize(input: RagPermissionInput): Promise<boolean> {
		return this.allowed.has(
			`${input.context.userId}|${input.scope.tenantId}|${ragScopeFingerprint(input.scope)}|${input.permission}`,
		);
	}
}

export class InMemoryRagDocumentRepository implements RagDocumentRepository {
	private readonly data = new Map<string, RagDocumentRecord>();
	async create(document: RagDocumentRecord): Promise<void> {
		this.data.set(document.documentId, structuredClone(document));
	}
	async update(document: RagDocumentRecord): Promise<void> {
		this.data.set(document.documentId, structuredClone(document));
	}
	async get(documentId: string): Promise<RagDocumentRecord | undefined> {
		const value = this.data.get(documentId);
		return value ? structuredClone(value) : undefined;
	}
	async findReadyByChecksum(checksumSha256: string, scope: RagKnowledgeScope): Promise<RagDocumentRecord | undefined> {
		const fingerprint = ragScopeFingerprint(scope);
		for (const value of this.data.values())
			if (
				value.checksumSha256 === checksumSha256 &&
				value.status === "READY" &&
				ragScopeFingerprint(value.scope) === fingerprint
			)
				return structuredClone(value);
		return undefined;
	}
}

export class InMemoryRagChunkRepository implements RagChunkRepository {
	private readonly data = new Map<string, RagChunkRecord[]>();
	async replaceForDocument(documentId: string, chunks: readonly RagChunkRecord[]): Promise<void> {
		this.data.set(documentId, structuredClone([...chunks]));
	}
	async listByDocument(documentId: string): Promise<readonly RagChunkRecord[]> {
		return structuredClone(this.data.get(documentId) ?? []);
	}
}

export class InMemoryRagObjectStorage implements RagObjectStorage {
	private readonly data = new Map<string, Uint8Array>();
	async putIfAbsent(
		key: string,
		content: Uint8Array,
		_metadata: JsonObject,
	): Promise<{ storageKey: string; reused: boolean }> {
		const reused = this.data.has(key);
		if (!reused) this.data.set(key, Uint8Array.from(content));
		return { storageKey: key, reused };
	}
}

export class InMemoryRagLexicalIndex implements RagLexicalIndex {
	readonly version: string;
	readonly staged = new Map<string, readonly RagChunkRecord[]>();
	readonly active = new Set<string>();
	constructor(version = "lexical-v1") {
		this.version = version;
	}
	async stage(document: RagDocumentRecord, chunks: readonly RagChunkRecord[]) {
		this.staged.set(document.documentId, structuredClone([...chunks]));
		return { indexedChunkIds: chunks.map((chunk) => chunk.chunkId) };
	}
	async activate(documentId: string): Promise<void> {
		if (!this.staged.has(documentId)) throw new Error(`Lexical staging missing: ${documentId}`);
		this.active.add(documentId);
	}
	async remove(documentId: string): Promise<void> {
		this.active.delete(documentId);
		this.staged.delete(documentId);
	}
}

export class InMemoryRagVectorIndex implements RagVectorIndex {
	readonly version: string;
	readonly staged = new Map<string, readonly (readonly number[])[]>();
	readonly active = new Set<string>();
	constructor(version = "vector-v1") {
		this.version = version;
	}
	async stage(
		document: RagDocumentRecord,
		chunks: readonly RagChunkRecord[],
		vectors: readonly (readonly number[])[],
	) {
		this.staged.set(document.documentId, structuredClone([...vectors]));
		return { indexedChunkIds: chunks.map((chunk) => chunk.chunkId) };
	}
	async activate(documentId: string): Promise<void> {
		if (!this.staged.has(documentId)) throw new Error(`Vector staging missing: ${documentId}`);
		this.active.add(documentId);
	}
	async remove(documentId: string): Promise<void> {
		this.active.delete(documentId);
		this.staged.delete(documentId);
	}
}

export class InMemoryRagTraceSink implements RagIngestionTraceSink {
	readonly events: {
		traceId: string;
		requestId: string;
		documentId: string;
		stage: string;
		status: string;
		details?: JsonObject;
	}[] = [];
	record(event: Parameters<RagIngestionTraceSink["record"]>[0]): void {
		this.events.push(structuredClone(event));
	}
}
