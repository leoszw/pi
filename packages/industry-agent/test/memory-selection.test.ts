import { describe, expect, it } from "vitest";
import { context, service } from "./memory-helpers.ts";

describe("working memory selections", () => {
	it("requires selected rows to come from the current result set", async () => {
		const memory = service(); const ctx = context();
		await memory.captureResultSet(ctx, [{ rowId: "r1" }, { rowId: "r2" }], "TOOL_RESULT");
		await memory.setSelectedRows(ctx, [{ rowId: "r2" }], "USER_EXPLICIT");
		expect((await memory.resolve(ctx, "这些")).rowIds).toEqual(["r2"]);
		await expect(memory.setSelectedRows(ctx, [{ rowId: "r3" }], "USER_EXPLICIT")).rejects.toMatchObject({ code: "MEMORY_INVALID_UPDATE" });
	});
});
