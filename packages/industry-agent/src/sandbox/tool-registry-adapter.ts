import type { ToolRegistry } from "../tools/tool-registry.ts";
import type { SandboxToolCatalog } from "./types.ts";

export class ToolRegistrySandboxCatalog implements SandboxToolCatalog {
	private readonly registry: ToolRegistry;

	constructor(registry: ToolRegistry) {
		this.registry = registry;
	}

	list() {
		return this.registry.list();
	}

	get(name: string, version: string) {
		return this.registry.has(name, version) ? this.registry.get(name, version) : undefined;
	}
}
