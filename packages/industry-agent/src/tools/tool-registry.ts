import type { ToolDefinition } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";

function toolKey(name: string, version: string): string {
	return `${name}@${version}`;
}

export class ToolRegistry {
	private readonly definitions = new Map<string, ToolDefinition>();

	register(definition: ToolDefinition): void {
		const key = toolKey(definition.name, definition.version);
		if (this.definitions.has(key)) {
			throw new IndustryAgentError("DUPLICATE_TOOL", `Tool already registered: ${key}`, {
				details: { name: definition.name, version: definition.version },
			});
		}
		this.definitions.set(key, definition);
	}

	get(name: string, version: string): ToolDefinition {
		const key = toolKey(name, version);
		const definition = this.definitions.get(key);
		if (!definition) {
			throw new IndustryAgentError("TOOL_NOT_FOUND", `Tool not found: ${key}`, {
				details: { name, version },
			});
		}
		return definition;
	}

	has(name: string, version: string): boolean {
		return this.definitions.has(toolKey(name, version));
	}

	list(): readonly ToolDefinition[] {
		return Array.from(this.definitions.values()).sort((left, right) => {
			const nameOrder = left.name.localeCompare(right.name);
			return nameOrder === 0 ? left.version.localeCompare(right.version) : nameOrder;
		});
	}
}
