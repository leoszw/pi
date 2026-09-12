import { describe, expect, it } from "vitest";
import { AgentLoopService, InMemoryAgentLoopToolCatalog, RecordingAgentLoopToolExecutor, ScriptedAgentLoopPlanner, ScriptedAgentLoopVerifier } from "../src/agent-loop/index.ts";
import { context, limits, readTool, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop tool failure", () => {
	it("lets verifier replan a normal metered ToolResult failure without automatic retry", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [
			{ kind: "TOOL", action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "query" }, usage: zeroUsage() },
			{ kind: "FINISH", answer: "fallback answer", usage: zeroUsage() },
		]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [{ kind: "REPLAN", feedback: "tool failed; use fallback", usage: zeroUsage() }]);
		const executor = new RecordingAgentLoopToolExecutor((invocation) => ({ result: { toolCallId: invocation.toolCallId, ok: false, error: { code: "UPSTREAM", message: "down" } }, usage: zeroUsage(), usageAccountingComplete: true }));
		const result = await new AgentLoopService({ planner, verifier, tools: new InMemoryAgentLoopToolCatalog([readTool()]), executor, limits: limits() }).run({ goal: "g", context: context() });
		expect(result.status).toBe("SUCCEEDED");
		expect(result.answer).toBe("fallback answer");
		expect(executor.invocations).toHaveLength(1);
	});
});
