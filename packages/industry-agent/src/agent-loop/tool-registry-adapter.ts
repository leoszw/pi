import type { ToolDefinition } from "../contracts/index.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import type { AgentLoopToolCatalog } from "./types.ts";

export class ToolRegistryAgentLoopCatalog implements AgentLoopToolCatalog {
	private readonly registry: Pick<ToolRegistry, "list" | "has" | "get">;
	constructor(registry: Pick<ToolRegistry, "list" | "has" | "get">) { this.registry = registry; }
	list(): readonly ToolDefinition[] { return this.registry.list(); }
	get(name: string, version: string): ToolDefinition | undefined {
		return this.registry.has(name, version) ? this.registry.get(name, version) : undefined;
	}
}
