import { describe, expect, it } from "vitest";
import {
	AgentLoopService,
	InMemoryAgentLoopToolCatalog,
	RecordingAgentLoopToolExecutor,
	ScriptedAgentLoopPlanner,
	ScriptedAgentLoopVerifier,
} from "../src/agent-loop/index.ts";
import { context, limits, readTool, usage } from "./agent-loop-helpers.ts";

describe("agent loop cost budget", () => {
	it("blocks Act if planner overshoots cost budget", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [
			{
				kind: "TOOL",
				action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" },
				usage: usage(10, 0.51),
			},
		]);
		const executor = new RecordingAgentLoopToolExecutor(() => {
			throw new Error("must not execute");
		});
		const result = await new AgentLoopService({
			planner,
			verifier: new ScriptedAgentLoopVerifier("v1", []),
			tools: new InMemoryAgentLoopToolCatalog([readTool()]),
			executor,
			limits: limits({ maxCostUsd: 0.5 }),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("COST_BUDGET_EXCEEDED");
		expect(executor.invocations).toHaveLength(0);
	});
});
