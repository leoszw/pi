import type { ToolInvocation, ToolResult } from "../../contracts/index.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { getReadToolDefinition, READ_TOOL_DEFINITIONS } from "./definitions.ts";
import { executeReadHandler } from "./handlers.ts";
import type { ReadToolRuntimeOptions } from "./types.ts";
import { requireReadScope, validateReadToolArgs } from "./validation.ts";

function errorResult(invocation: ToolInvocation, error: unknown): ToolResult {
	if (error instanceof IndustryAgentError)
		return { toolCallId: invocation.toolCallId, ok: false, error: { code: error.code, message: error.message } };
	return {
		toolCallId: invocation.toolCallId,
		ok: false,
		error: { code: "REPOSITORY_ERROR", message: error instanceof Error ? error.message : String(error) },
	};
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(
					() => reject(new IndustryAgentError("TOOL_TIMEOUT", `READ tool timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export class ReadToolRuntime {
	private readonly options: ReadToolRuntimeOptions;
	constructor(options: ReadToolRuntimeOptions) {
		this.options = options;
	}
	listDefinitions() {
		return READ_TOOL_DEFINITIONS;
	}
	async execute(invocation: ToolInvocation): Promise<ToolResult> {
		const definition = getReadToolDefinition(invocation.toolName, invocation.toolVersion);
		if (!definition)
			return errorResult(
				invocation,
				new IndustryAgentError(
					"TOOL_NOT_FOUND",
					`Tool not found: ${invocation.toolName}@${invocation.toolVersion}`,
				),
			);
		this.options.trace?.recordToolStart(invocation.toolCallId, invocation.toolName, invocation.args);
		try {
			if (definition.action !== "READ" && definition.action !== "SEARCH")
				throw new IndustryAgentError("TOOL_ACCESS_DENIED", "READ runtime cannot execute mutation actions");
			const scope = requireReadScope(invocation.context);
			const permission = definition.permission;
			if (!permission)
				throw new IndustryAgentError("TOOL_ACCESS_DENIED", "READ tool is missing a permission declaration");
			const allowed = await this.options.permissionService.authorize({
				...scope,
				permission,
				toolName: definition.name,
			});
			if (!allowed) throw new IndustryAgentError("TOOL_ACCESS_DENIED", `Permission denied: ${permission}`);
			const args = validateReadToolArgs(definition, invocation.args);
			const data = await withTimeout(
				executeReadHandler({ invocation, definition, scope, options: this.options }, args),
				definition.timeoutMs,
			);
			const result: ToolResult = { toolCallId: invocation.toolCallId, ok: true, data };
			this.options.trace?.recordToolEnd(invocation.toolCallId, invocation.toolName, result, false);
			return result;
		} catch (error) {
			const result = errorResult(invocation, error);
			this.options.trace?.recordToolEnd(invocation.toolCallId, invocation.toolName, result, true);
			return result;
		}
	}
}
