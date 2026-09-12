import { describe, expect, it } from "vitest";
import { AgentLoopService, InMemoryAgentLoopToolCatalog, RecordingAgentLoopToolExecutor, ScriptedAgentLoopPlanner, ScriptedAgentLoopVerifier } from "../src/agent-loop/index.ts";
import { context, limits, readTool, usage, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop success", () => {
	it("plans, acts, verifies and preserves server request context", async () => {
		const planner = new ScriptedAgentLoopPlanner("planner-v1", [{ kind: "TOOL", action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "find boq" }, usage: usage(10) }]);
		const verifier = new ScriptedAgentLoopVerifier("verifier-v1", [{ kind: "SATISFIED", answer: "done", usage: usage(5) }]);
		const executor = new RecordingAgentLoopToolExecutor((invocation) => ({ result: { toolCallId: invocation.toolCallId, ok: true, data: { rows: [] } }, usage: zeroUsage(), usageAccountingComplete: true }));
		const service = new AgentLoopService({ planner, verifier, tools: new InMemoryAgentLoopToolCatalog([readTool()]), executor, limits: limits(), idFactory: () => "tool-call-1" });
		const ctx = context(); const result = await service.run({ goal: "find boq", context: ctx });
		expect(result.status).toBe("SUCCEEDED");
		expect(result.answer).toBe("done");
		expect(result.usage.totalTokens).toBe(15);
		expect(executor.invocations[0]?.context).toEqual(ctx);
		expect(executor.invocations[0]?.args).toEqual({});
		expect(planner.inputs[0]?.safety.scopeSource).toBe("SERVER_REQUEST_CONTEXT");
	});
});
