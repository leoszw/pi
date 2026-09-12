import { describe, expect, it } from "vitest";
import { AgentLoopService, InMemoryAgentLoopToolCatalog, RecordingAgentLoopToolExecutor, ScriptedAgentLoopPlanner, ScriptedAgentLoopVerifier } from "../src/agent-loop/index.ts";
import { commitTool, context, limits, prepareTool, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop mutation safety", () => {
	it("blocks confirmation-required critical tools", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [{ kind: "TOOL", action: { toolName: "commit_mutation", toolVersion: "1.0.0", args: { operationId: "op", approvalToken: "token" }, purpose: "commit" }, usage: zeroUsage() }]);
		const executor = new RecordingAgentLoopToolExecutor(() => { throw new Error("must not execute"); });
		const result = await new AgentLoopService({ planner, verifier: new ScriptedAgentLoopVerifier("v1", []), tools: new InMemoryAgentLoopToolCatalog([commitTool()]), executor, limits: limits() }).run({ goal: "update", context: context() });
		expect(result.status).toBe("CONFIRMATION_REQUIRED");
		expect(executor.invocations).toHaveLength(0);
	});
	it("allows dry-run mutation prepare but blocks non-dry-run mutation even if misconfigured non-critical", async () => {
		const direct = { ...prepareTool(), name: "unsafe_update", supportsDryRun: false, riskLevel: "HIGH" as const };
		const planner = new ScriptedAgentLoopPlanner("p1", [{ kind: "TOOL", action: { toolName: "unsafe_update", toolVersion: "1.0.0", args: {}, purpose: "unsafe" }, usage: zeroUsage() }]);
		const executor = new RecordingAgentLoopToolExecutor(() => { throw new Error("must not execute"); });
		const result = await new AgentLoopService({ planner, verifier: new ScriptedAgentLoopVerifier("v1", []), tools: new InMemoryAgentLoopToolCatalog([direct]), executor, limits: limits() }).run({ goal: "update", context: context() });
		expect(result.status).toBe("CONFIRMATION_REQUIRED");
		expect(executor.invocations).toHaveLength(0);
	});
});
