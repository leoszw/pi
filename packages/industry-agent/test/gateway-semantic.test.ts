import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { SemanticFrame } from "../src/contracts/index.ts";
import type { AgentRuntime } from "../src/gateway/agent-gateway.ts";
import { IndustryAgentGateway } from "../src/gateway/agent-gateway.ts";
import type { SemanticParser } from "../src/semantic/query-parser.ts";
import { InMemoryTraceRepository } from "../src/trace/in-memory-trace-repository.ts";

class SemanticRuntime implements AgentRuntime {
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
		await this.listener?.({ type: "agent_end", messages: this.state.messages.slice() }, signal);
	}
}

class ThrowingSemanticParser implements SemanticParser {
	parse(): SemanticFrame {
		throw new Error("parser unavailable");
	}
}

describe("IndustryAgentGateway semantic integration", () => {
	it("passes the parsed SemanticFrame to the runtime factory and persists it in the trace", async () => {
		const repository = new InMemoryTraceRepository();
		const ids = ["trace-semantic-1", "request-semantic-1", "conversation-semantic-1"];
		let idIndex = 0;
		let receivedFrame: SemanticFrame | undefined;
		const gateway = new IndustryAgentGateway({
			runtimeFactory: (_context, _telemetry, frame) => {
				receivedFrame = frame;
				return new SemanticRuntime();
			},
			contextFactoryOptions: {
				idFactory: () => ids[idIndex++] ?? "unexpected-id",
				now: () => new Date("2026-09-11T00:00:00.000Z"),
			},
			trace: {
				repository,
				idFactory: (() => {
					let id = 0;
					return () => `semantic-span-${++id}`;
				})(),
			},
		});

		const result = await gateway.run({
			message: "查K12+300左幅的工程部位",
			userId: "user-1",
			tenantId: "tenant-1",
			projectId: "123456789012345678",
		});
		const snapshot = await repository.getSnapshot("trace-semantic-1");

		expect(result.semanticFrame.intent).toBe("QUERY_ENGINEERING_POSITION");
		expect(receivedFrame?.filters.chainage_m).toBe(12300);
		expect(receivedFrame?.filters.project_id).toBe("123456789012345678");
		expect(snapshot?.trace.semanticFrame).toEqual(result.semanticFrame);
	});

	it("falls back to UNKNOWN when semantic parsing fails and still executes the Agent", async () => {
		const repository = new InMemoryTraceRepository();
		const ids = ["trace-semantic-2", "request-semantic-2", "conversation-semantic-2"];
		let idIndex = 0;
		const gateway = new IndustryAgentGateway({
			runtimeFactory: () => new SemanticRuntime(),
			semanticParser: new ThrowingSemanticParser(),
			contextFactoryOptions: {
				idFactory: () => ids[idIndex++] ?? "unexpected-id",
				now: () => new Date("2026-09-11T00:00:00.000Z"),
			},
			trace: {
				repository,
				idFactory: (() => {
					let id = 0;
					return () => `fallback-span-${++id}`;
				})(),
			},
		});

		const result = await gateway.run({ message: "查一下这个", userId: "user-1", tenantId: "tenant-1" });
		const snapshot = await repository.getSnapshot("trace-semantic-2");

		expect(result.semanticFrame.intent).toBe("UNKNOWN");
		expect(result.messages).toHaveLength(2);
		expect(snapshot?.trace.semanticFrame?.intent).toBe("UNKNOWN");
		expect(snapshot?.errors.some((error) => error.code === "SEMANTIC_PARSE_ERROR")).toBe(true);
	});
});
