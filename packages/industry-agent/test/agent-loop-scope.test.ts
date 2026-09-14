import { describe, expect, it } from "vitest";
import {
	AgentLoopService,
	InMemoryAgentLoopToolCatalog,
	RecordingAgentLoopToolExecutor,
	ScriptedAgentLoopPlanner,
	ScriptedAgentLoopVerifier,
} from "../src/agent-loop/index.ts";
import { context, limits, readTool, zeroUsage } from "./agent-loop-helpers.ts";

describe("agent loop server scope", () => {
	it("rejects a planner scope mismatch before tool execution", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [
			{
				kind: "TOOL",
				action: { toolName: "search_boq", toolVersion: "1.0.0", args: { projectId: "p-other" }, purpose: "q" },
				usage: zeroUsage(),
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
			limits: limits(),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("FAILED");
		expect(executor.invocations).toHaveLength(0);
	});
	it("strips even matching scope args so downstream scope comes only from RequestContext", async () => {
		const planner = new ScriptedAgentLoopPlanner("p1", [
			{
				kind: "TOOL",
				action: { toolName: "search_boq", toolVersion: "1.0.0", args: { projectId: "p1" }, purpose: "q" },
				usage: zeroUsage(),
			},
		]);
		const verifier = new ScriptedAgentLoopVerifier("v1", [{ kind: "SATISFIED", answer: "ok", usage: zeroUsage() }]);
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
			limits: limits(),
		}).run({ goal: "g", context: context() });
		expect(result.status).toBe("SUCCEEDED");
		expect(executor.invocations[0]?.args).toEqual({});
	});
});
