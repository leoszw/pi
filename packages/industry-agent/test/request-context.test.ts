import { describe, expect, it } from "vitest";
import { createRequestContext } from "../src/context/request-context.ts";

function sequenceIdFactory(ids: readonly string[]): () => string {
	let index = 0;
	return () => {
		const id = ids[index];
		if (id === undefined) {
			throw new Error("id sequence exhausted");
		}
		index += 1;
		return id;
	};
}

describe("createRequestContext", () => {
	it("generates trace, request, and conversation ids when conversation id is absent", () => {
		const context = createRequestContext(
			{ userId: "user-1", tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" },
			{
				idFactory: sequenceIdFactory(["trace-1", "request-1", "conversation-1"]),
				now: () => new Date("2026-09-11T00:00:00.000Z"),
			},
		);

		expect(context).toEqual({
			traceId: "trace-1",
			requestId: "request-1",
			conversationId: "conversation-1",
			userId: "user-1",
			tenantId: "tenant-1",
			companyId: "company-1",
			projectId: "project-1",
			createdAt: "2026-09-11T00:00:00.000Z",
		});
	});

	it("preserves an existing conversation id", () => {
		const context = createRequestContext(
			{ userId: "user-1", tenantId: "tenant-1", conversationId: "conversation-existing" },
			{ idFactory: sequenceIdFactory(["trace-1", "request-1"]) },
		);

		expect(context.conversationId).toBe("conversation-existing");
	});

	it("rejects empty required identifiers", () => {
		expect(() => createRequestContext({ userId: " ", tenantId: "tenant-1" })).toThrow("userId must not be empty");
	});
});
