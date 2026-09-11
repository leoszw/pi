export interface TraceRedactionPolicy {
	sensitiveFields: readonly string[];
	replacement?: string;
	maxDepth?: number;
}

export interface TraceRedactor {
	redact(value: unknown): unknown;
}

const DEFAULT_SENSITIVE_FIELDS = [
	"apiKey",
	"authorization",
	"cookie",
	"password",
	"secret",
	"accessToken",
	"refreshToken",
	"clientSecret",
] as const;

function redactValue(
	value: unknown,
	sensitiveFields: ReadonlySet<string>,
	replacement: string,
	maxDepth: number,
	depth: number,
): unknown {
	if (depth > maxDepth) {
		return "[MAX_DEPTH]";
	}
	if (Array.isArray(value)) {
		return value.map((item) => redactValue(item, sensitiveFields, replacement, maxDepth, depth + 1));
	}
	if (value === null || typeof value !== "object") {
		return value;
	}

	const output: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value)) {
		output[key] = sensitiveFields.has(key.toLowerCase())
			? replacement
			: redactValue(nestedValue, sensitiveFields, replacement, maxDepth, depth + 1);
	}
	return output;
}

export class SchemaTraceRedactor implements TraceRedactor {
	private readonly sensitiveFields: ReadonlySet<string>;
	private readonly replacement: string;
	private readonly maxDepth: number;

	constructor(policy: Partial<TraceRedactionPolicy> = {}) {
		this.sensitiveFields = new Set((policy.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS).map((field) => field.toLowerCase()));
		this.replacement = policy.replacement ?? "[REDACTED]";
		this.maxDepth = policy.maxDepth ?? 20;
	}

	redact(value: unknown): unknown {
		return redactValue(value, this.sensitiveFields, this.replacement, this.maxDepth, 0);
	}
}
