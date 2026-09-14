import { describe, expect, it } from "vitest";
import {
	AgentLoopService,
	InMemoryAgentLoopToolCatalog,
	InMemoryAgentLoopTraceSink,
	RecordingAgentLoopToolExecutor,
	ScriptedAgentLoopVerifier,
} from "../src/agent-loop/index.ts";
import { context, limits, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop timeout and trace", () => {
	it("aborts a slow planner at the operation timeout and traces termination", async () => {
		const trace = new InMemoryAgentLoopTraceSink();
		const planner = {
			version: "slow-v1",
			async plan(_input: never, signal: AbortSignal) {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(resolve, 50);
					signal.addEventListener(
						"abort",
						() => {
							clearTimeout(timer);
							reject(new Error("aborted"));
						},
						{ once: true },
					);
				});
				return { kind: "FINISH" as const, answer: "late", usage: zeroUsage() };
			},
		};
		const result = await new AgentLoopService({
			planner,
			verifier: new ScriptedAgentLoopVerifier("v1", []),
			tools: new InMemoryAgentLoopToolCatalog([]),
			executor: new RecordingAgentLoopToolExecutor(() => ({
				result: { toolCallId: "x", ok: true },
				usage: zeroUsage(),
				usageAccountingComplete: true,
			})),
			limits: limits({ maxOperationMs: 5 }),
			trace,
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("TIMEOUT");
		expect(trace.events.at(-1)?.event).toBe("TERMINATE");
		expect(result.usageAccountingComplete).toBe(false);
	});
});
