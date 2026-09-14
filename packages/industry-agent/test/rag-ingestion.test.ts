import { describe, expect, it } from "vitest";
import { makeRagHarness, ragTestContext, ragTestScope } from "./rag-ingestion-helpers.ts";

describe("RAG ingestion", () => {
	it("runs to READY with complete versions, scope propagation and activated indexes", async () => {
		const h = makeRagHarness();
		const content = new TextEncoder().encode("# 总则\n\n第一段。\n\n|列1|列2|\n|a|b|");
		const out = await h.service.ingest({
			context: ragTestContext,
			scope: ragTestScope,
			file: { fileName: "a.md", mimeType: "text/markdown", sizeBytes: content.length, content },
		});
		expect(out.document.status).toBe("READY");
		expect(out.document.versions).toMatchObject({
			parserVersion: "parser-v1",
			chunkerVersion: "chunk-v1",
			embeddingVersion: "embed-v1",
			lexicalIndexVersion: "lex-v1",
			vectorIndexVersion: "vec-v1",
		});
		expect(out.chunks[0]?.scope).toEqual(ragTestScope);
		expect(h.lexicalIndex.active.has(out.document.documentId)).toBe(true);
		expect(h.vectorIndex.active.has(out.document.documentId)).toBe(true);
	});
	it("deduplicates only inside the identical security scope", async () => {
		const h = makeRagHarness();
		const content = new TextEncoder().encode("# A\n正文");
		const req = {
			context: ragTestContext,
			scope: ragTestScope,
			file: { fileName: "a.md", mimeType: "text/markdown", sizeBytes: content.length, content },
		};
		const first = await h.service.ingest(req);
		const second = await h.service.ingest(req);
		expect(second.deduplicated).toBe(true);
		expect(second.document.duplicateOfDocumentId).toBe(first.document.documentId);
	});
	it("does not reuse a checksum across a different ACL fingerprint", async () => {
		const h = makeRagHarness();
		const content = new TextEncoder().encode("# A\n正文");
		await h.service.ingest({
			context: ragTestContext,
			scope: ragTestScope,
			file: { fileName: "a.md", mimeType: "text/markdown", sizeBytes: content.length, content },
		});
		const alternate = { ...ragTestScope, aclRoles: ["reviewer"] };
		h.permissions.allow({ userId: "u1", scope: alternate, permission: "knowledge.ingest" });
		const second = await h.service.ingest({
			context: ragTestContext,
			scope: alternate,
			file: { fileName: "b.md", mimeType: "text/markdown", sizeBytes: content.length, content },
		});
		expect(second.deduplicated).toBe(false);
	});
});
