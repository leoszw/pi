import type { ToolRegistry } from "../tool-registry.ts";
import { READ_TOOL_DEFINITIONS } from "./definitions.ts";

export function registerReadToolDefinitions(registry: ToolRegistry): void {
	for (const definition of READ_TOOL_DEFINITIONS) registry.register(definition);
}
