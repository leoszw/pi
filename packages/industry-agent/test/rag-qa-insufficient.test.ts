import { describe, expect, it, vi } from "vitest";
import { RagQaService } from "../src/rag/qa/service.ts";
import { context, options } from "./rag-qa-helpers.ts";

describe("evidence gate", () => {
	it("does not call generator when evidence is insufficient", async () => {
		const generate = vi.fn(async () => "should not happen");
		const opts = options([], { answerGenerator: { generate } });
		const result = await new RagQaService(opts).answer({ context, question: "不存在的规范" });
		expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
		expect(result.citations).toEqual([]);
		expect(generate).not.toHaveBeenCalled();
	});
});
