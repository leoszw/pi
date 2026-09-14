import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "../src/gateway/agent-gateway.ts";
import { IndustryAgentGateway } from "../src/gateway/agent-gateway.ts";
import { InMemoryTraceRepository } from "../src/trace/in-memory-trace-repository.ts";
import type { TraceRepository } from "../src/trace/repository.ts";
import type {
	TraceErrorRecord,
	TraceLlmCallRecord,
	TraceRecord,
	TraceRetrievalRecord,
	TraceSnapshot,
	TraceSpanRecord,
	TraceToolCallRecord,
} from "../src/trace/types.ts";

class CompletingRuntime implements AgentRuntime {
	readonly state: { messages: AgentMessage[] } = { messages: [] };
	private listener?: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void;

	subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(input: string): Promise<void> {
		const signal = new AbortController().signal;
		const user: AgentMessage = { role: "user", content: input, timestamp: 1 };
		const assistant: AgentMessage = {
			role: "assistant",
			content: [{ type: "text", text: "done" }],
			api: "test",
			provider: "test",
			model: "test",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 2,
		};
		this.state.messages.push(user, assistant);
		await this.listener?.({ type: "agent_start" }, signal);
		await this.listener?.({ type: "turn_start" }, signal);
		await this.listener?.({ type: "message_start", message: assistant }, signal);
		await this.listener?.({ type: "message_end", message: assistant }, signal);
		await this.listener?.({ type: "turn_end", message: assistant, toolResults: [] }, signal);
		await this.listener?.({ type: "agent_end", messages: this.state.messages.slice() }, signal);
	}
}

class FailingTraceRepository implements TraceRepository {
	async saveTrace(_record: TraceRecord): Promise<void> {
		throw new Error("trace backend unavailable");
	}
	async saveSpan(_record: TraceSpanRecord): Promise<void> {
		throw new Error("trace backend unavailable");
	}
	async saveLlmCall(_record: TraceLlmCallRecord): Promise<void> {
		throw new Error("trace backend unavailable");
	}
	async saveToolCall(_record: TraceToolCallRecord): Promise<void> {
		throw new Error("trace backend unavailable");
	}
	async saveRetrieval(_record: TraceRetrievalRecord): Promise<void> {
		throw new Error("trace backend unavailable");
	}
	async saveError(_record: TraceErrorRecord): Promise<void> {
		throw new Error("trace backend unavailable");
	}
	async getSnapshot(_traceId: string): Promise<TraceSnapshot | undefined> {
		return undefined;
	}
}

describe("IndustryAgentGateway trace integration", () => {
	it("persists a completed request under the request trace_id", async () => {
		const repository = new InMemoryTraceRepository();
		const ids = ["trace-1", "request-1", "conversation-1"];
		let idIndex = 0;
		const gateway = new IndustryAgentGateway({
			runtimeFactory: () => new CompletingRuntime(),
			contextFactoryOptions: { idFactory: () => ids[idIndex++] ?? "unexpected-id" },
			trace: {
				repository,
				idFactory: (() => {
					let id = 0;
					return () => `span-${++id}`;
				})(),
			},
		});

		await gateway.run({ message: "hello", userId: "user-1", tenantId: "tenant-1" });
		const snapshot = await repository.getSnapshot("trace-1");

		expect(snapshot?.trace.status).toBe("COMPLETED");
		expect(snapshot?.trace.originalQuery).toBe("hello");
		expect(snapshot?.trace.finalResponse).toBe("done");
		expect(snapshot?.trace.llmCallCount).toBe(1);
	});

	it("does not fail the agent request when trace persistence fails", async () => {
		let persistenceFailures = 0;
		const gateway = new IndustryAgentGateway({
			runtimeFactory: () => new CompletingRuntime(),
			trace: {
				repository: new FailingTraceRepository(),
				onPersistenceError: () => {
					persistenceFailures += 1;
				},
			},
		});

		const result = await gateway.run({ message: "hello", userId: "user-1", tenantId: "tenant-1" });

		expect(result.messages).toHaveLength(2);
		expect(persistenceFailures).toBeGreaterThan(0);
	});
});
