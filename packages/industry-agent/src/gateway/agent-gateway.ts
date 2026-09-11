import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentOptions,
} from "@earendil-works/pi-agent-core";
import {
	createRequestContext,
	type CreateRequestContextInput,
	type RequestContextFactoryOptions,
} from "../context/request-context.ts";
import type { RequestContext } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";

export interface AgentRuntime {
	readonly state: {
		readonly messages: AgentMessage[];
	};
	subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
	prompt(input: string): Promise<void>;
}

export type AgentRuntimeFactory = (context: RequestContext) => AgentRuntime;

export interface IndustryAgentRequest extends CreateRequestContextInput {
	message: string;
}

export interface IndustryAgentStreamEvent {
	context: RequestContext;
	event: AgentEvent;
}

export interface IndustryAgentResult {
	context: RequestContext;
	messages: readonly AgentMessage[];
}

export interface IndustryAgentGatewayOptions {
	runtimeFactory: AgentRuntimeFactory;
	contextFactoryOptions?: RequestContextFactoryOptions;
}

export function createPiAgentRuntimeFactory(optionsFactory: (context: RequestContext) => AgentOptions): AgentRuntimeFactory {
	return (context) => new Agent(optionsFactory(context));
}

export class IndustryAgentGateway {
	private readonly runtimeFactory: AgentRuntimeFactory;
	private readonly contextFactoryOptions?: RequestContextFactoryOptions;

	constructor(options: IndustryAgentGatewayOptions) {
		this.runtimeFactory = options.runtimeFactory;
		this.contextFactoryOptions = options.contextFactoryOptions;
	}

	async run(
		request: IndustryAgentRequest,
		onEvent?: (event: IndustryAgentStreamEvent) => Promise<void> | void,
	): Promise<IndustryAgentResult> {
		if (request.message.trim().length === 0) {
			throw new IndustryAgentError("INVALID_REQUEST", "message must not be empty");
		}

		const context = createRequestContext(request, this.contextFactoryOptions);
		const runtime = this.runtimeFactory(context);
		const unsubscribe = onEvent
			? runtime.subscribe((event) => onEvent({ context, event }))
			: undefined;

		try {
			await runtime.prompt(request.message);
			return {
				context,
				messages: runtime.state.messages.slice(),
			};
		} catch (cause) {
			throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Pi Agent execution failed", {
				cause,
				details: { traceId: context.traceId, requestId: context.requestId },
			});
		} finally {
			unsubscribe?.();
		}
	}
}
