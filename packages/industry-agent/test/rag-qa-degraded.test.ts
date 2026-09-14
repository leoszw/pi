import { describe, expect, it } from "vitest";
import { RagQaService } from "../src/rag/qa/service.ts";
import { context, options } from "./rag-qa-helpers.ts";

describe("rag qa degraded retrieval", () => {
	it("keeps lexical retrieval when embedding fails", async () => {
		const base = options();
		const service = new RagQaService({
			...base,
			embedding: {
				version: "bad",
				dimension: 2,
				async embedQuery() {
					throw new Error("embedding down");
				},
			},
		});
		const result = await service.answer({ context, question: "桥梁 混凝土", debug: true });
		expect(result.status).toBe("ANSWERED");
		expect(result.debug?.degraded).toContain("DENSE");
	});
});
