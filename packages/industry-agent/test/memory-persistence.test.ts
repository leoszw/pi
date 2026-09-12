import { describe, expect, it } from "vitest";
import { toWorkingMemorySnapshotRecord } from "../src/memory/index.ts";
import type { WorkingMemoryState } from "../src/memory/index.ts";

describe("working memory persistence contract", () => {
	it("maps to the existing Phase 0 memory_item contract", () => {
		const state: WorkingMemoryState = { scope: { conversationId: "c", tenantId: "t", userId: "u", companyId: "co" }, revision: 1, recentToolResults: [], lastUpdatedTraceId: "tr", createdAt: "a", updatedAt: "b", expiresAt: "z" };
		const record = toWorkingMemorySnapshotRecord(state);
		expect(record.memoryType).toBe("WORKING_MEMORY_V1");
		expect(record.sourceTraceId).toBe("tr");
		expect(record.validUntil).toBe("z");
	});
});
