import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentOptions,
	type TelemetryContext,
} from "@earendil-works/pi-agent-core";
import {
	createRequestContext,
	type CreateRequestContextInput,
	type RequestContextFactoryOptions,
} from "../context/request-context.ts";
import type { RequestContext } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import { TraceCollector, type TraceCollectorOptions } from "../trace/trace-collector.ts";

export interface AgentRuntime {
	readonly state: {
		readonly messages: AgentMessage[];
	};
	subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
	prompt(input: string): Promise<void>;
}

export type AgentRuntimeFactory = (context: RequestContext, telemetryContext?: TelemetryContext) => AgentRuntime;

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
	trace?: TraceCollectorOptions;
}

export function createPiAgentRuntimeFactory(optionsFactory: (context: RequestContext) => AgentOptions): AgentRuntimeFactory {
	return (context, telemetryContext) => {
		const options = optionsFactory(context);
		if (!telemetryContext) return new Agent(options);
		const streamFn = options.streamFn;
		return new Agent({
			...options,
			streamFn: (model, agentContext, streamOptions) =>
				streamFn(model, agentContext, { ...streamOptions, telemetryContext }),
		});
	};
}

export class IndustryAgentGateway {
	private readonly runtimeFactory: AgentRuntimeFactory;
	private readonly contextFactoryOptions?: RequestContextFactoryOptions;
	private readonly traceOptions?: TraceCollectorOptions;

	constructor(options: IndustryAgentGatewayOptions) {
		this.runtimeFactory = options.runtimeFactory;
		this.contextFactoryOptions = options.contextFactoryOptions;
		this.traceOptions = options.trace;
	}

	async run(
		request: IndustryAgentRequest,
		onEvent?: (event: IndustryAgentStreamEvent) => Promise<void> | void,
	): Promise<IndustryAgentResult> {
		if (request.message.trim().length === 0) {
			throw new IndustryAgentError("INVALID_REQUEST", "message must not be empty");
		}

		const context = createRequestContext(request, this.contextFactoryOptions);
		const trace = this.traceOptions ? new TraceCollector(context, request.message, this.traceOptions) : undefined;
		let runtime: AgentRuntime;
		try {
			runtime = this.runtimeFactory(context, trace?.telemetryContext);
		} catch (cause) {
			await trace?.fail(cause);
			throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Pi Agent initialization failed", {
				cause,
				details: { traceId: context.traceId, requestId: context.requestId },
			});
		}

		const unsubscribe = runtime.subscribe(async (event) => {
			trace?.recordAgentEvent(event);
			await onEvent?.({ context, event });
		});

		try {
			await runtime.prompt(request.message);
			await trace?.complete(runtime.state.messages);
			return {
				context,
				messages: runtime.state.messages.slice(),
			};
		} catch (cause) {
			await trace?.fail(cause);
			throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Pi Agent execution failed", {
				cause,
				details: { traceId: context.traceId, requestId: context.requestId },
			});
		} finally {
			unsubscribe();
		}
	}
}
