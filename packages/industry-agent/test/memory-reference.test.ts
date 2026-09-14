import { describe, expect, it } from "vitest";
import { context, service } from "./memory-helpers.ts";

describe("working memory references", () => {
	it("resolves current rows, ordinal, unfinished, continue and export", async () => {
		const memory = service();
		const ctx = context();
		await memory.captureResultSet(
			ctx,
			[
				{ rowId: "r1", entityId: "e1" },
				{ rowId: "r2", entityId: "e2" },
			],
			"TOOL_RESULT",
		);
		await memory.recordToolResult(ctx, {
			toolCallId: "call-1",
			toolName: "search_boq",
			resultRefs: ["e1", "e2"],
			continuationToken: "next-1",
		});
		expect((await memory.resolve(ctx, "这些")).rowIds).toEqual(["r1", "r2"]);
		expect((await memory.resolve(ctx, "第二个")).entityIds).toEqual(["e2"]);
		expect((await memory.resolve(ctx, "只看未完成的")).derivedFilters[0]?.value).toBe("UNFINISHED");
		expect((await memory.resolve(ctx, "继续")).continueFrom?.continuationToken).toBe("next-1");
		expect((await memory.resolve(ctx, "把这些导出来")).kind).toBe("EXPORT_CURRENT");
	});
});
