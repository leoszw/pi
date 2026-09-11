import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../src/contracts/index.ts";
import { ToolRegistry } from "../src/tools/tool-registry.ts";

const definition: ToolDefinition = {
	name: "search_engineering_positions",
	version: "1.0.0",
	domain: "engineering",
	action: "SEARCH",
	description: "Search engineering positions",
	inputSchema: { type: "object" },
	outputSchema: { type: "object" },
	allowedEntityTypes: ["engineering_position"],
	riskLevel: "LOW",
	requiresConfirmation: false,
	supportsDryRun: false,
	idempotent: true,
	timeoutMs: 5000,
};

describe("ToolRegistry", () => {
	it("registers and resolves a versioned tool definition", () => {
		const registry = new ToolRegistry();
		registry.register(definition);

		expect(registry.has(definition.name, definition.version)).toBe(true);
		expect(registry.get(definition.name, definition.version)).toBe(definition);
	});

	it("rejects duplicate name and version pairs", () => {
		const registry = new ToolRegistry();
		registry.register(definition);

		expect(() => registry.register(definition)).toThrow("Tool already registered");
	});

	it("throws for unknown tools", () => {
		const registry = new ToolRegistry();
		expect(() => registry.get("missing", "1.0.0")).toThrow("Tool not found");
	});
});
