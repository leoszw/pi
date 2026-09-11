import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "../src/gateway/agent-gateway.ts";
import { IndustryAgentGateway } from "../src/gateway/agent-gateway.ts";

class FakeAgentRuntime implements AgentRuntime {
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
		const userMessage: AgentMessage = {
			role: "user",
			content: [{ type: "text", text: input }],
			timestamp: 1,
		};
		this.state.messages.push(userMessage);
		await this.listener?.({ type: "agent_start" }, signal);
		await this.listener?.({ type: "message_start", message: userMessage }, signal);
		await this.listener?.({ type: "message_end", message: userMessage }, signal);
		await this.listener?.({ type: "agent_end", messages: this.state.messages.slice() }, signal);
	}
}

describe("IndustryAgentGateway", () => {
	it("creates a request context and forwards Pi Agent lifecycle events", async () => {
		const runtime = new FakeAgentRuntime();
		const ids = ["trace-1", "request-1", "conversation-1"];
		let idIndex = 0;
		const gateway = new IndustryAgentGateway({
			runtimeFactory: () => runtime,
			contextFactoryOptions: {
				idFactory: () => {
					const id = ids[idIndex];
					if (id === undefined) {
						throw new Error("id sequence exhausted");
					}
					idIndex += 1;
					return id;
				},
				now: () => new Date("2026-09-11T00:00:00.000Z"),
			},
		});
		const eventTypes: string[] = [];

		const result = await gateway.run(
			{ message: "hello", userId: "user-1", tenantId: "tenant-1" },
			(streamEvent) => {
				eventTypes.push(streamEvent.event.type);
				expect(streamEvent.context.traceId).toBe("trace-1");
			},
		);

		expect(result.context.traceId).toBe("trace-1");
		expect(result.context.requestId).toBe("request-1");
		expect(result.context.conversationId).toBe("conversation-1");
		expect(eventTypes).toEqual(["agent_start", "message_start", "message_end", "agent_end"]);
		expect(result.messages).toHaveLength(1);
	});

	it("rejects blank messages before creating a runtime", async () => {
		let runtimeCreated = false;
		const gateway = new IndustryAgentGateway({
			runtimeFactory: () => {
				runtimeCreated = true;
				return new FakeAgentRuntime();
			},
		});

		await expect(gateway.run({ message: " ", userId: "user-1", tenantId: "tenant-1" })).rejects.toThrow(
			"message must not be empty",
		);
		expect(runtimeCreated).toBe(false);
	});
});
