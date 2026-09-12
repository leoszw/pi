import { describe, expect, it } from "vitest";
import { InMemoryWorkingMemoryRepository } from "../src/memory/index.ts";
import type { WorkingMemoryState } from "../src/memory/index.ts";

describe("working memory repository", () => {
	it("rejects optimistic revision conflicts", async () => {
		const repository = new InMemoryWorkingMemoryRepository(); const now = "2026-09-12T00:00:00.000Z";
		const state: WorkingMemoryState = { scope: { conversationId: "c", tenantId: "t", userId: "u", companyId: null }, revision: 1, recentToolResults: [], lastUpdatedTraceId: "tr", createdAt: now, updatedAt: now, expiresAt: "2026-09-13T00:00:00.000Z" };
		await repository.save(state, null);
		await expect(repository.save({ ...state, revision: 2 }, 0)).rejects.toMatchObject({ code: "MEMORY_VERSION_CONFLICT" });
	});
});
