import { describe, expect, it } from "vitest";
import { AgentLoopService, InMemoryAgentLoopToolCatalog, RecordingAgentLoopToolExecutor, ScriptedAgentLoopPlanner, ScriptedAgentLoopVerifier } from "../src/agent-loop/index.ts";
import { context, limits, readTool, usage, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop accounting", () => {
	it("includes tool-internal model usage and propagates incomplete accounting", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [{ kind: "TOOL", action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" }, usage: usage(10) }]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [{ kind: "SATISFIED", answer: "ok", usage: usage(5) }]);
		const executor = new RecordingAgentLoopToolExecutor((invocation) => ({ result: { toolCallId: invocation.toolCallId, ok: true }, usage: usage(20), usageAccountingComplete: false }));
		const result = await new AgentLoopService({ planner, verifier, tools: new InMemoryAgentLoopToolCatalog([readTool()]), executor, limits: limits() }).run({ goal: "g", context: context() });
		expect(result.status).toBe("USAGE_ACCOUNTING_INCOMPLETE");
		expect(result.usage.totalTokens).toBe(30);
		expect(verifier.inputs).toHaveLength(0);
		expect(result.usageAccountingComplete).toBe(false);
	});
	it("stops if an executor throws and accounting can no longer be proven complete", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [{ kind: "TOOL", action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" }, usage: zeroUsage() }]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [{ kind: "FAIL", reason: "must not run", usage: zeroUsage() }]);
		const executor = new RecordingAgentLoopToolExecutor(() => { throw new Error("boom"); });
		const result = await new AgentLoopService({ planner, verifier, tools: new InMemoryAgentLoopToolCatalog([readTool()]), executor, limits: limits() }).run({ goal: "g", context: context() });
		expect(result.status).toBe("USAGE_ACCOUNTING_INCOMPLETE");
		expect(executor.invocations).toHaveLength(1);
		expect(verifier.inputs).toHaveLength(0);
		expect(result.usageAccountingComplete).toBe(false);
	});
});
