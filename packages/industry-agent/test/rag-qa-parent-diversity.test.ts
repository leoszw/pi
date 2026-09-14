import { describe, expect, it } from "vitest";
import { RagQaService } from "../src/rag/qa/service.ts";
import { chunk, context, document, options } from "./rag-qa-helpers.ts";

describe("parent expansion and diversity", () => {
	it("uses same ACL source reader and limits per document", async () => {
		const d = document("d1", { chunkCount: 3 });
		const parent = chunk("p", "d1", "桥梁总则");
		const c1 = chunk("c1", "d1", "桥梁 混凝土 A", { parentChunkId: "p", contentHash: "h1" });
		const c2 = chunk("c2", "d1", "桥梁 混凝土 B", { contentHash: "h2" });
		const c3 = chunk("c3", "d1", "桥梁 混凝土 C", { contentHash: "h3" });
		const opts = options([
			{ document: d, chunk: parent, vector: [0, 1] },
			{ document: d, chunk: c1, vector: [1, 0] },
			{ document: d, chunk: c2, vector: [1, 0] },
			{ document: d, chunk: c3, vector: [1, 0] },
		]);
		opts.config = { ...opts.config, maxPerDocument: 2, finalK: 3 };
		const result = await new RagQaService(opts).answer({ context, question: "桥梁 混凝土" });
		const ids = result.citations.map((c) => c.chunkId);
		expect(ids).toContain("p");
		expect(ids.filter((id) => id !== "p").length).toBeLessThanOrEqual(2);
	});
});
