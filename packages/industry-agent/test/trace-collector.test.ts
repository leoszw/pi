import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { RequestContext } from "../src/contracts/index.ts";
import { InMemoryTraceRepository } from "../src/trace/in-memory-trace-repository.ts";
import { TraceCollector } from "../src/trace/trace-collector.ts";

const CONTEXT: RequestContext = {
	traceId: "trace-1",
	requestId: "request-1",
	conversationId: "conversation-1",
	userId: "user-1",
	tenantId: "tenant-1",
	createdAt: "2026-09-11T00:00:00.000Z",
};

function assistantMessage(stopReason: "stop" | "error" = "stop"): Extract<AgentMessage, { role: "assistant" }> {
	return {
		role: "assistant",
		content: [{ type: "text", text: stopReason === "stop" ? "done" : "" }],
		api: "test-api",
		provider: "test-provider",
		model: "test-model",
		responseModel: "test-model-v2",
		usage: {
			input: 10,
			output: 5,
			cacheRead: 2,
			cacheWrite: 1,
			reasoning: 3,
			totalTokens: 18,
			cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.01, total: 0.32 },
		},
		stopReason,
		errorMessage: stopReason === "error" ? "provider failed" : undefined,
		timestamp: 1,
	};
}

describe("TraceCollector", () => {
	it("records agent, LLM, tool, retrieval, and telemetry activity with redaction", async () => {
		const repository = new InMemoryTraceRepository();
		let id = 0;
		let time = 0;
		const collector = new TraceCollector(CONTEXT, "show boq", {
			repository,
			idFactory: () => `trace-record-${++id}`,
			now: () => new Date(`2026-09-11T00:00:${String(time++).padStart(2, "0")}.000Z`),
			resolveToolMetadata: () => ({ toolVersion: "1.0.0", action: "READ" }),
		});
		const assistant = assistantMessage();

		collector.recordAgentEvent({ type: "agent_start" });
		collector.recordAgentEvent({ type: "turn_start" });
		collector.recordAgentEvent({ type: "message_start", message: assistant });
		collector.recordAgentEvent({
			type: "tool_execution_start",
			toolCallId: "tool-1",
			toolName: "boq.search",
			args: { authorization: "Bearer secret", projectId: "project-1" },
		});
		collector.recordAgentEvent({
			type: "tool_execution_end",
			toolCallId: "tool-1",
			toolName: "boq.search",
			result: { rows: 2 },
			isError: false,
		});
		collector.recordRetrieval({
			retrievalType: "boq-hybrid",
			status: "OK",
			query: "路基",
			filters: { password: "secret", projectId: "project-1" },
			candidates: [{ entityId: "1", score: 0.9 }],
		});
		await collector.telemetryContext.startSpan(
			{ name: "provider.request", attributes: { apiKey: "secret", provider: "test-provider" } },
			async (span) => {
				span.addEvent("retry", { authorization: "secret" });
			},
		);
		collector.recordAgentEvent({ type: "message_end", message: assistant });
		collector.recordAgentEvent({ type: "turn_end", message: assistant, toolResults: [] });
		collector.recordAgentEvent({ type: "agent_end", messages: [assistant] });
		await collector.complete([assistant]);

		const snapshot = await repository.getSnapshot("trace-1");
		expect(snapshot?.trace.status).toBe("COMPLETED");
		expect(snapshot?.trace.finalResponse).toBe("done");
		expect(snapshot?.trace.llmCallCount).toBe(1);
		expect(snapshot?.trace.toolCallCount).toBe(1);
		expect(snapshot?.trace.retrievalCount).toBe(1);
		expect(snapshot?.trace.totals).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 18 });
		expect(snapshot?.toolCalls[0]?.input).toEqual({ authorization: "[REDACTED]", projectId: "project-1" });
		expect(snapshot?.retrievals[0]?.filters).toEqual({ password: "[REDACTED]", projectId: "project-1" });
		const telemetrySpan = snapshot?.spans.find((span) => span.name === "provider.request");
		expect(telemetrySpan?.attributes).toEqual({ apiKey: "[REDACTED]", provider: "test-provider" });
		expect(telemetrySpan?.events[0]?.attributes).toEqual({ authorization: "[REDACTED]" });
	});

	it("marks telemetry callback failures without swallowing the callback error", async () => {
		const repository = new InMemoryTraceRepository();
		const collector = new TraceCollector(CONTEXT, "hello", { repository, idFactory: () => "span-1" });

		await expect(
			collector.telemetryContext.startSpan({ name: "provider.request" }, () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		await collector.flush();

		const snapshot = await repository.getSnapshot("trace-1");
		expect(snapshot?.spans[0]?.status).toBe("ERROR");
	});
});
