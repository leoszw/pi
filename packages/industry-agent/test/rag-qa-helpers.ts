import type { RagChunkRecord, RagDocumentRecord, RagKnowledgeScope } from "../src/rag/ingestion/types.ts";
import { InMemoryRagQaCorpus, StaticRagQaAccessContextProvider } from "../src/rag/qa/in-memory.ts";
import { DeterministicRagQueryRewriter, PassthroughRagContextResolver } from "../src/rag/qa/rewriter.ts";
import type { RagQaConfig, RagQaServiceOptions } from "../src/rag/qa/types.ts";

export const scope: RagKnowledgeScope = {
	tenantId: "t1",
	industryId: "i1",
	companyId: "c1",
	projectId: "p1",
	departmentId: null,
	ownerUserId: "u1",
	visibility: "PROJECT",
	aclUsers: [],
	aclRoles: [],
	securityTags: [],
};
export const context = {
	traceId: "tr1",
	requestId: "rq1",
	conversationId: "cv1",
	userId: "u1",
	tenantId: "t1",
	companyId: "c1",
	projectId: "p1",
	createdAt: "2026-09-12T00:00:00Z",
};
export const config: RagQaConfig = {
	version: "rag-qa-v1",
	aclPolicyVersion: "rag-acl-v1",
	bm25TopK: 80,
	denseTopK: 80,
	entityTopK: 40,
	fusionKeepK: 80,
	rrfK: 60,
	armWeights: { BM25: 0.35, DENSE: 0.5, ENTITY: 0.15 },
	rerankK: 50,
	finalK: 8,
	maxPerDocument: 3,
	parentExpansionChars: 1200,
	minTopRerankScore: 0.35,
	minEvidenceCount: 1,
	insufficientEvidenceText: "证据不足",
};
export function document(id = "d1", overrides: Partial<RagDocumentRecord> = {}): RagDocumentRecord {
	return {
		documentId: id,
		traceId: "tr-ingest",
		requestId: "rq-ingest",
		fileName: `${id}.md`,
		mimeType: "text/markdown",
		sizeBytes: 100,
		checksumSha256: `sha-${id}`,
		status: "READY",
		scope,
		scopeFingerprint: "fp",
		metadata: {},
		versions: {
			parserVersion: "parser-v1",
			chunkerVersion: "chunk-v1",
			embeddingVersion: "emb-v1",
			lexicalIndexVersion: "lex-v1",
			vectorIndexVersion: "vec-v1",
		},
		chunkCount: 1,
		createdAt: "2026-09-12T00:00:00Z",
		updatedAt: "2026-09-12T00:00:00Z",
		readyAt: "2026-09-12T00:00:00Z",
		...overrides,
	};
}
export function chunk(
	id = "k1",
	doc = "d1",
	text = "桥梁 混凝土 施工要求",
	overrides: Partial<RagChunkRecord> = {},
): RagChunkRecord {
	return {
		chunkId: id,
		documentId: doc,
		sourceBlockId: `b-${id}`,
		ordinal: 0,
		type: "PARAGRAPH",
		text,
		sectionPath: ["桥梁工程", "施工要求"],
		pageStart: 1,
		pageEnd: 1,
		metadata: {},
		scope,
		scopeFingerprint: "fp",
		contentHash: `hash-${id}`,
		entityIds: [],
		chunkerVersion: "chunk-v1",
		embeddingVersion: "emb-v1",
		lexicalIndexVersion: "lex-v1",
		vectorIndexVersion: "vec-v1",
		...overrides,
	};
}
export function options(
	entries = [{ document: document(), chunk: chunk(), vector: [1, 0] }],
	overrides: Partial<RagQaServiceOptions> = {},
): RagQaServiceOptions {
	const corpus = new InMemoryRagQaCorpus(entries);
	return {
		access: new StaticRagQaAccessContextProvider({
			userId: "u1",
			tenantId: "t1",
			companyId: "c1",
			projectId: "p1",
			industryId: "i1",
			departmentId: null,
			roles: [],
			securityTags: [],
		}),
		contextResolver: new PassthroughRagContextResolver(),
		rewriter: new DeterministicRagQueryRewriter(),
		embedding: {
			version: "qe-v1",
			dimension: 2,
			async embedQuery() {
				return [1, 0];
			},
		},
		retrieval: corpus,
		reranker: {
			version: "rr-v1",
			async rerank(_q, c) {
				return c.map((x, i) => ({ chunkId: x.chunk.chunkId, score: 0.9 - i * 0.1 }));
			},
		},
		sources: corpus,
		answerGenerator: {
			async generate(input) {
				return `答案 ${input.evidence.map((e) => e.citation.citationId).join(",")}`;
			},
		},
		config,
		...overrides,
	};
}
