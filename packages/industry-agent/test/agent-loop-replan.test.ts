import { describe, expect, it } from "vitest";
import { AgentLoopService, InMemoryAgentLoopToolCatalog, RecordingAgentLoopToolExecutor, ScriptedAgentLoopPlanner, ScriptedAgentLoopVerifier } from "../src/agent-loop/index.ts";
import { context, limits, readTool, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop replan", () => {
	it("replans after verification and stays bounded", async () => {
		const action = (purpose: string) => ({ kind: "TOOL" as const, action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose }, usage: zeroUsage() });
		const planner = new ScriptedAgentLoopPlanner("p1", [action("first"), action("second")]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [{ kind: "REPLAN", feedback: "need another query", usage: zeroUsage() }, { kind: "SATISFIED", answer: "ok", usage: zeroUsage() }]);
		const executor = new RecordingAgentLoopToolExecutor((invocation) => ({ result: { toolCallId: invocation.toolCallId, ok: true }, usage: zeroUsage(), usageAccountingComplete: true }));
		const result = await new AgentLoopService({ planner, verifier, tools: new InMemoryAgentLoopToolCatalog([readTool()]), executor, limits: limits(), idFactory: (() => { let n=0; return () => `tc-${++n}`; })() }).run({ goal: "g", context: context() });
		expect(result.status).toBe("SUCCEEDED");
		expect(result.steps).toBe(2);
		expect(result.toolCalls).toBe(2);
		expect(result.history[0]?.feedback).toBe("need another query");
	});
});
