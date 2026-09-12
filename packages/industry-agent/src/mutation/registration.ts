import type { ToolRegistry } from "../tools/tool-registry.ts";
import { MUTATION_TOOL_DEFINITIONS } from "./definitions.ts";

export function registerMutationTools(registry: ToolRegistry): void {
	for (const definition of MUTATION_TOOL_DEFINITIONS) registry.register(definition);
}
