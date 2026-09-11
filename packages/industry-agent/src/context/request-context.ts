import { uuidv7 } from "@earendil-works/pi-agent-core";
import type { RequestContext } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";

export interface CreateRequestContextInput {
	userId: string;
	tenantId: string;
	conversationId?: string;
	companyId?: string;
	projectId?: string;
}

export interface RequestContextFactoryOptions {
	idFactory?: () => string;
	now?: () => Date;
}

function requireIdentifier(name: string, value: string): string {
	if (value.trim().length === 0) {
		throw new IndustryAgentError("INVALID_REQUEST", `${name} must not be empty`);
	}
	return value;
}

function optionalIdentifier(name: string, value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requireIdentifier(name, value);
}

export function createRequestContext(
	input: CreateRequestContextInput,
	options: RequestContextFactoryOptions = {},
): RequestContext {
	const idFactory = options.idFactory ?? uuidv7;
	const now = options.now ?? (() => new Date());

	return {
		traceId: idFactory(),
		requestId: idFactory(),
		conversationId: optionalIdentifier("conversationId", input.conversationId) ?? idFactory(),
		userId: requireIdentifier("userId", input.userId),
		tenantId: requireIdentifier("tenantId", input.tenantId),
		companyId: optionalIdentifier("companyId", input.companyId),
		projectId: optionalIdentifier("projectId", input.projectId),
		createdAt: now().toISOString(),
	};
}
