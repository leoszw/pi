import { describe, expect, it } from "vitest";
import { ToolRegistryAgentLoopCatalog } from "../src/agent-loop/index.ts";
import { ToolRegistry } from "../src/tools/tool-registry.ts";
import { readTool } from "./agent-loop-helpers.ts";

describe("agent loop tool registry adapter", () => {
	it("reuses the existing versioned ToolRegistry", () => {
		const registry = new ToolRegistry(); registry.register(readTool());
		const catalog = new ToolRegistryAgentLoopCatalog(registry);
		expect(catalog.get("search_boq", "1.0.0")?.name).toBe("search_boq");
		expect(catalog.get("missing", "1.0.0")).toBe(undefined);
	});
});
