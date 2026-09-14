import { describe, expect, it } from "vitest";
import {
	AgentLoopService,
	InMemoryAgentLoopToolCatalog,
	RecordingAgentLoopToolExecutor,
	ScriptedAgentLoopPlanner,
	ScriptedAgentLoopVerifier,
} from "../src/agent-loop/index.ts";
import { context, limits, readTool, usage, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop budgets", () => {
	it("blocks act when planner exceeds token budget", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [
			{
				kind: "TOOL",
				action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" },
				usage: usage(101),
			},
		]);
		const executor = new RecordingAgentLoopToolExecutor(() => {
			throw new Error("must not run");
		});
		const result = await new AgentLoopService({
			planner,
			verifier: new ScriptedAgentLoopVerifier("v1", []),
			tools: new InMemoryAgentLoopToolCatalog([readTool()]),
			executor,
			limits: limits({ maxTotalTokens: 100 }),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("TOKEN_BUDGET_EXCEEDED");
		expect(executor.invocations).toHaveLength(0);
	});
	it("permits a final answer that exactly consumes the budget", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [{ kind: "FINISH", answer: "done", usage: usage(100) }]);
		const result = await new AgentLoopService({
			planner,
			verifier: new ScriptedAgentLoopVerifier("v1", []),
			tools: new InMemoryAgentLoopToolCatalog([]),
			executor: new RecordingAgentLoopToolExecutor(() => ({
				result: { toolCallId: "x", ok: true },
				usage: zeroUsage(),
				usageAccountingComplete: true,
			})),
			limits: limits({ maxTotalTokens: 100 }),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("SUCCEEDED");
	});
	it("does not call verifier when no model-token budget remains", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [
			{
				kind: "TOOL",
				action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" },
				usage: usage(100),
			},
		]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [
			{ kind: "SATISFIED", answer: "should not run", usage: zeroUsage() },
		]);
		const executor = new RecordingAgentLoopToolExecutor((invocation) => ({
			result: { toolCallId: invocation.toolCallId, ok: true },
			usage: zeroUsage(),
			usageAccountingComplete: true,
		}));
		const result = await new AgentLoopService({
			planner,
			verifier,
			tools: new InMemoryAgentLoopToolCatalog([readTool()]),
			executor,
			limits: limits({ maxTotalTokens: 100 }),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("TOKEN_BUDGET_EXCEEDED");
		expect(verifier.inputs).toHaveLength(0);
	});
});
