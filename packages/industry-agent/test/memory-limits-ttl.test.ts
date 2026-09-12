import { describe, expect, it } from "vitest";
import { InMemoryWorkingMemoryRepository, WorkingMemoryService } from "../src/memory/index.ts";
import { context } from "./memory-helpers.ts";

describe("working memory bounds", () => {
	it("bounds result rows and expires old snapshots", async () => {
		let now = new Date("2026-09-12T00:00:00.000Z"); const repository = new InMemoryWorkingMemoryRepository();
		const memory = new WorkingMemoryService({ repository, now: () => now, limits: { ttlMs: 1000, maxResultRows: 2 } }); const ctx = context();
		await memory.captureResultSet(ctx, [{ rowId: "r1" }, { rowId: "r2" }, { rowId: "r3" }], "TOOL_RESULT");
		expect((await memory.view(ctx)).lastResultSet).toHaveLength(2);
		now = new Date("2026-09-12T00:00:02.000Z");
		expect((await memory.resolve(ctx, "这些")).requiresClarification).toBe(true);
		await memory.captureResultSet(ctx, [{ rowId: "r4" }], "TOOL_RESULT");
		expect((await memory.view(ctx)).lastResultSet[0]?.rowId).toBe("r4");
	});
});
