import { describe, expect, it } from "vitest";
import {
	AgentLoopService,
	InMemoryAgentLoopToolCatalog,
	RecordingAgentLoopToolExecutor,
	ScriptedAgentLoopPlanner,
	ScriptedAgentLoopVerifier,
} from "../src/agent-loop/index.ts";
import { context, limits, readTool, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop termination", () => {
	it("stops at max tool calls", async () => {
		const action = {
			kind: "TOOL" as const,
			action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" },
			usage: zeroUsage(),
		};
		const planner = new ScriptedAgentLoopPlanner("p1", [action, action]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [{ kind: "REPLAN", feedback: "again", usage: zeroUsage() }]);
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
			limits: limits({ maxToolCalls: 1 }),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("MAX_TOOL_CALLS");
		expect(result.toolCalls).toBe(1);
	});
	it("stops at max steps after repeated replanning", async () => {
		const action = {
			kind: "TOOL" as const,
			action: { toolName: "search_boq", toolVersion: "1.0.0", args: {}, purpose: "q" },
			usage: zeroUsage(),
		};
		const planner = new ScriptedAgentLoopPlanner("p1", [action, action]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [
			{ kind: "REPLAN", feedback: "again", usage: zeroUsage() },
			{ kind: "REPLAN", feedback: "again", usage: zeroUsage() },
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
			limits: limits({ maxSteps: 2, maxToolCalls: 3 }),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("MAX_STEPS");
	});
});
