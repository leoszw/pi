import type { RequestContext } from "../../contracts/index.ts";
import { isAccessible } from "./access.ts";
import type {
	RagQaAccessContext,
	RagQaAccessContextProvider,
	RagQaAccessFilter,
	RagQaCorpusEntry,
	RagQaRetrievalBackend,
	RagQaSearchCandidate,
	RagQaSourceReader,
} from "./types.ts";

function tokens(text: string): readonly string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}_-]+/u)
		.filter(Boolean);
}
function lexicalScore(query: string, text: string): number {
	const q = tokens(query);
	if (!q.length) return 0;
	const source = new Set(tokens(text));
	return q.filter((token) => source.has(token)).length / q.length;
}
function cosine(left: readonly number[], right: readonly number[]): number {
	if (left.length !== right.length || !left.length) return 0;
	let dot = 0,
		a = 0,
		b = 0;
	for (let i = 0; i < left.length; i += 1) {
		const l = left[i] ?? 0;
		const r = right[i] ?? 0;
		dot += l * r;
		a += l * l;
		b += r * r;
	}
	return a && b ? dot / Math.sqrt(a * b) : 0;
}

export class StaticRagQaAccessContextProvider implements RagQaAccessContextProvider {
	private readonly access: RagQaAccessContext;
	constructor(access: RagQaAccessContext) {
		this.access = structuredClone(access);
	}
	async resolve(context: RequestContext): Promise<RagQaAccessContext> {
		if (context.userId !== this.access.userId || context.tenantId !== this.access.tenantId)
			throw new Error("access context mismatch");
		return structuredClone(this.access);
	}
}

export class InMemoryRagQaCorpus implements RagQaRetrievalBackend, RagQaSourceReader {
	private readonly entries: readonly RagQaCorpusEntry[];
	constructor(entries: readonly RagQaCorpusEntry[]) {
		this.entries = entries.map((entry) => structuredClone(entry));
	}
	private allowed(filter: RagQaAccessFilter): readonly RagQaCorpusEntry[] {
		return this.entries.filter((entry) => isAccessible(entry.document, entry.chunk, filter));
	}
	async bm25(query: string, filter: RagQaAccessFilter, topK: number): Promise<readonly RagQaSearchCandidate[]> {
		return this.allowed(filter)
			.map((entry) => ({
				chunk: entry.chunk,
				document: entry.document,
				score: lexicalScore(query, `${entry.chunk.sectionPath.join(" ")} ${entry.chunk.text}`),
				arm: "BM25" as const,
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => b.score - a.score || a.chunk.chunkId.localeCompare(b.chunk.chunkId))
			.slice(0, topK);
	}
	async dense(
		vector: readonly number[],
		filter: RagQaAccessFilter,
		topK: number,
	): Promise<readonly RagQaSearchCandidate[]> {
		return this.allowed(filter)
			.filter((entry) => entry.vector)
			.map((entry) => ({
				chunk: entry.chunk,
				document: entry.document,
				score: cosine(vector, entry.vector ?? []),
				arm: "DENSE" as const,
			}))
			.sort((a, b) => b.score - a.score || a.chunk.chunkId.localeCompare(b.chunk.chunkId))
			.slice(0, topK);
	}
	async entityAware(
		query: string,
		entityIds: readonly string[],
		filter: RagQaAccessFilter,
		topK: number,
	): Promise<readonly RagQaSearchCandidate[]> {
		const wanted = new Set(entityIds);
		return this.allowed(filter)
			.filter((entry) => entry.chunk.entityIds.some((id) => wanted.has(id)))
			.map((entry) => ({
				chunk: entry.chunk,
				document: entry.document,
				score: 1 + lexicalScore(query, entry.chunk.text),
				arm: "ENTITY" as const,
			}))
			.slice(0, topK);
	}
	async getChunk(chunkId: string, filter: RagQaAccessFilter) {
		return this.allowed(filter).find((entry) => entry.chunk.chunkId === chunkId)?.chunk;
	}
	async getDocument(documentId: string, filter: RagQaAccessFilter) {
		return this.allowed(filter).find((entry) => entry.document.documentId === documentId)?.document;
	}
}
