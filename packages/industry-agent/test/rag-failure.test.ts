import { describe, expect, it } from "vitest";
import { IndustryAgentError } from "../src/errors/industry-agent-error.ts";
import type { RagQualityInput, RagQualityValidator } from "../src/rag/ingestion/types.ts";
import { makeRagHarness, ragTestContext, ragTestScope } from "./rag-ingestion-helpers.ts";

class FailQuality implements RagQualityValidator {
	validate(_input: RagQualityInput): void {
		throw new IndustryAgentError("RAG_QUALITY_FAILED", "bad quality");
	}
}
describe("RAG failure visibility", () => {
	it("persists failure stage/reason and never activates failed staged indexes", async () => {
		const h = makeRagHarness(new FailQuality());
		const content = new TextEncoder().encode("# A\n正文");
		let id = "";
		try {
			await h.service.ingest({
				context: ragTestContext,
				scope: ragTestScope,
				file: { fileName: "a.md", mimeType: "text/markdown", sizeBytes: content.length, content },
			});
		} catch {}
		const event = h.trace.events.find((e) => e.stage === "FAILED");
		expect(event?.status).toBe("ERROR");
		for (const e of h.trace.events) if (e.documentId) id = e.documentId;
		const doc = await h.documents.get(id);
		expect(doc?.status).toBe("FAILED");
		expect(doc?.failure?.stage).toBe("QUALITY_VALIDATING");
		expect(h.lexicalIndex.active.has(id)).toBe(false);
		expect(h.vectorIndex.active.has(id)).toBe(false);
	});
});
