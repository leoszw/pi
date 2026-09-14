import { describe, expect, it } from "vitest";
import type { AgentLoopPlanner, AgentPlannerDecision } from "../src/agent-loop/index.ts";
import {
	AgentLoopService,
	InMemoryAgentLoopToolCatalog,
	RecordingAgentLoopToolExecutor,
	ScriptedAgentLoopVerifier,
} from "../src/agent-loop/index.ts";
import { context, limits, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop model boundary", () => {
	it("fails closed on a malformed planner decision", async () => {
		const planner: AgentLoopPlanner = {
			version: "bad-v1",
			async plan() {
				return { kind: "BOGUS", usage: zeroUsage() } as unknown as AgentPlannerDecision;
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
			limits: limits(),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("FAILED");
		expect(result.steps).toBe(1);
		expect(result.usageAccountingComplete).toBe(false);
	});
});
