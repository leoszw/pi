export type IndustryAgentErrorCode =
	| "INVALID_REQUEST"
	| "DUPLICATE_TOOL"
	| "TOOL_NOT_FOUND"
	| "TOOL_ACCESS_DENIED"
	| "TOOL_SCOPE_REQUIRED"
	| "TOOL_INPUT_INVALID"
	| "TOOL_TIMEOUT"
	| "MUTATION_POLICY_NOT_FOUND"
	| "MUTATION_RECORD_NOT_FOUND"
	| "MUTATION_VALIDATION_ERROR"
	| "MUTATION_PROPOSAL_NOT_FOUND"
	| "MUTATION_APPROVAL_REQUIRED"
	| "MUTATION_APPROVAL_INVALID"
	| "MUTATION_APPROVAL_EXPIRED"
	| "MUTATION_APPROVAL_REPLAYED"
	| "MUTATION_VERSION_CONFLICT"
	| "MUTATION_DIGEST_MISMATCH"
	| "MUTATION_VERIFY_FAILED"
	| "REPOSITORY_ERROR"
	| "AGENT_EXECUTION_ERROR"
	| "TRACE_NOT_FOUND"
	| "TRACE_ACCESS_DENIED"
	| "RETRIEVAL_ERROR";

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
