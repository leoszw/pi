export type IndustryAgentErrorCode =
	| "INVALID_REQUEST"
	| "DUPLICATE_TOOL"
	| "TOOL_NOT_FOUND"
	| "REPOSITORY_ERROR"
	| "AGENT_EXECUTION_ERROR"
	| "TRACE_NOT_FOUND"
	| "TRACE_ACCESS_DENIED";

export interface IndustryAgentErrorOptions {
	cause?: unknown;
	details?: Readonly<Record<string, unknown>>;
}

export class IndustryAgentError extends Error {
	readonly code: IndustryAgentErrorCode;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(code: IndustryAgentErrorCode, message: string, options: IndustryAgentErrorOptions = {}) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "IndustryAgentError";
		this.code = code;
		this.details = options.details;
	}
}
