import { describe, expect, it } from "vitest";
import type { RequestContext } from "../src/contracts/index.ts";
import { InMemoryTraceRepository } from "../src/trace/in-memory-trace-repository.ts";
import { TraceQueryService } from "../src/trace/query-service.ts";
import { TraceCollector } from "../src/trace/trace-collector.ts";

const CONTEXT: RequestContext = {
	traceId: "trace-query",
	requestId: "request-query",
	conversationId: "conversation-query",
	userId: "user-1",
	tenantId: "tenant-1",
	companyId: "company-1",
	projectId: "project-1",
	createdAt: "2026-09-11T00:00:00.000Z",
};

describe("TraceQueryService", () => {
	it("returns timeline, tree, and stats for an authorized trace scope", async () => {
		const repository = new InMemoryTraceRepository();
		let id = 0;
		const collector = new TraceCollector(CONTEXT, "hello", {
			repository,
			idFactory: () => `id-${++id}`,
			now: () => new Date("2026-09-11T00:00:01.000Z"),
		});
		collector.recordAgentEvent({ type: "agent_start" });
		collector.recordAgentEvent({ type: "turn_start" });
		collector.recordRetrieval({ retrievalType: "test", status: "OK", query: "hello" });
		collector.recordAgentEvent({ type: "turn_end", message: { role: "user", content: "hello", timestamp: 1 }, toolResults: [] });
		collector.recordAgentEvent({ type: "agent_end", messages: [{ role: "user", content: "hello", timestamp: 1 }] });
		await collector.flush();

		const service = new TraceQueryService(repository);
		const scope = { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" };
		const timeline = await service.getTimeline("trace-query", scope);
		const tree = await service.getTree("trace-query", scope);
		const stats = await service.getStats("trace-query", scope);

		expect(timeline.map((item) => item.sequence)).toEqual([...timeline.map((item) => item.sequence)].sort((a, b) => a - b));
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.children).toHaveLength(1);
		expect(stats.retrievalCount).toBe(1);
	});

	it("rejects cross-tenant trace access", async () => {
		const repository = new InMemoryTraceRepository();
		const collector = new TraceCollector(CONTEXT, "hello", { repository });
		await collector.flush();
		const service = new TraceQueryService(repository);

		await expect(service.getTrace("trace-query", { tenantId: "tenant-2" })).rejects.toMatchObject({
			code: "TRACE_ACCESS_DENIED",
		});
	});
});
