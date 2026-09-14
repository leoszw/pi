import { describe, expect, it } from "vitest";
import { validateRouteDecision } from "../src/sandbox/validation.ts";
import { sandboxContext, sandboxReadTool, sandboxUsage } from "./sandbox-helpers.ts";

describe("M12 existing Tool handoff", () => {
	it("strips matching planner scope args and preserves server-owned scope", () => {
		const decision = validateRouteDecision(
			{
				kind: "USE_EXISTING_TOOLS",
				actions: [
					{
						toolName: "query_quantity",
						toolVersion: "1.0.0",
						args: { projectId: "project-1", entityId: "x" },
						purpose: "read quantity",
					},
				],
				usage: sandboxUsage(),
			},
			[sandboxReadTool()],
			sandboxContext(),
			4,
		);
		expect(decision.kind).toBe("USE_EXISTING_TOOLS");
		if (decision.kind === "USE_EXISTING_TOOLS") expect(decision.actions[0]?.args).toEqual({ entityId: "x" });
	});

	it("rejects planner scope override", () => {
		expect(() =>
			validateRouteDecision(
				{
					kind: "USE_EXISTING_TOOLS",
					actions: [
						{
							toolName: "query_quantity",
							toolVersion: "1.0.0",
							args: { projectId: "other-project" },
							purpose: "read quantity",
						},
					],
					usage: sandboxUsage(),
				},
				[sandboxReadTool()],
				sandboxContext(),
				4,
			),
		).toThrow();
	});
});
