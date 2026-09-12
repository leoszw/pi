import { describe, expect, it } from "vitest";
import { mergeWorkingMemorySemanticContext } from "../src/memory/index.ts";
import { context, service } from "./memory-helpers.ts";

describe("working memory semantic bridge", () => {
	it("merges resolved memory IDs without overriding explicit semantic project", async () => {
		const memory = service(); const ctx = context("project-1");
		await memory.captureResultSet(ctx, [{ rowId: "r1", entityId: "e1" }], "TOOL_RESULT");
		const view = await memory.view(ctx); const resolution = await memory.resolve(ctx, "这些");
		const merged = mergeWorkingMemorySemanticContext({ recentEntityIds: ["e0"], project: { id: "explicit-project" } }, view, resolution);
		expect(merged.recentEntityIds).toEqual(["e0", "e1"]);
		expect(merged.project?.id).toBe("explicit-project");
	});
});
