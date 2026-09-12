import { describe, expect, it } from "vitest";
import { context, service } from "./memory-helpers.ts";

describe("working memory source policy", () => {
	it("rejects unconfirmed LLM inference", async () => {
		const memory = service();
		await expect(memory.setActiveFilters(context(), { status: "OPEN" }, "LLM_INFERENCE")).rejects.toMatchObject({ code: "MEMORY_SOURCE_NOT_PERSISTABLE" });
	});
});
