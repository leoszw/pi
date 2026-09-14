import type { RequestContext } from "../src/contracts/index.ts";
import { InMemoryWorkingMemoryRepository, WorkingMemoryService } from "../src/memory/index.ts";

export function context(projectId = "project-1", conversationId = "conversation-1"): RequestContext {
	return {
		traceId: "trace-1",
		requestId: "request-1",
		conversationId,
		userId: "user-1",
		tenantId: "tenant-1",
		companyId: "company-1",
		projectId,
		createdAt: "2026-09-12T00:00:00.000Z",
	};
}

export function service(now = new Date("2026-09-12T00:00:00.000Z")) {
	return new WorkingMemoryService({ repository: new InMemoryWorkingMemoryRepository(), now: () => now });
}
