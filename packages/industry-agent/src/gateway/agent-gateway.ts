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
import type { SemanticContext } from "../context/semantic-context.ts";
import type { RequestContext, SemanticFrame } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import {
	createFallbackSemanticFrame,
	QueryParser,
	type SemanticParser,
} from "../semantic/query-parser.ts";
import { TraceCollector, type TraceCollectorOptions } from "../trace/trace-collector.ts";

export interface AgentRuntime {
	readonly state: {
		readonly messages: AgentMessage[];
	};
	subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
	prompt(input: string): Promise<void>;
}

export type AgentRuntimeFactory = (
	context: RequestContext,
	telemetryContext?: TelemetryContext,
	semanticFrame?: SemanticFrame,
) => AgentRuntime;

export interface IndustryAgentRequest extends CreateRequestContextInput {
	message: string;
	semanticContext?: SemanticContext;
}

export interface IndustryAgentStreamEvent {
	context: RequestContext;
	event: AgentEvent;
}

export interface IndustryAgentResult {
	context: RequestContext;
	semanticFrame: SemanticFrame;
	messages: readonly AgentMessage[];
}

export interface IndustryAgentGatewayOptions {
	runtimeFactory: AgentRuntimeFactory;
	contextFactoryOptions?: RequestContextFactoryOptions;
	semanticParser?: SemanticParser;
	trace?: TraceCollectorOptions;
}

export function createPiAgentRuntimeFactory(
	optionsFactory: (context: RequestContext, semanticFrame?: SemanticFrame) => AgentOptions,
): AgentRuntimeFactory {
	return (context, telemetryContext, semanticFrame) => {
		const options = optionsFactory(context, semanticFrame);
		if (!telemetryContext) return new Agent(options);
		const streamFn = options.streamFn;
		return new Agent({
			...options,
			streamFn: (model, agentContext, streamOptions) =>
				streamFn(model, agentContext, { ...streamOptions, telemetryContext }),
		});
	};
}

function semanticParseErrorDetails(cause: unknown): Readonly<Record<string, unknown>> {
	if (cause instanceof Error) return { name: cause.name, message: cause.message };
	return { value: String(cause) };
}

export class IndustryAgentGateway {
	private readonly runtimeFactory: AgentRuntimeFactory;
	private readonly contextFactoryOptions?: RequestContextFactoryOptions;
	private readonly semanticParser: SemanticParser;
	private readonly traceOptions?: TraceCollectorOptions;

	constructor(options: IndustryAgentGatewayOptions) {
		this.runtimeFactory = options.runtimeFactory;
		this.contextFactoryOptions = options.contextFactoryOptions;
		this.semanticParser = options.semanticParser ?? new QueryParser();
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
		let semanticFrame: SemanticFrame;
		try {
			semanticFrame = this.semanticParser.parse({
				text: request.message,
				requestContext: context,
				semanticContext: request.semanticContext,
			});
		} catch (cause) {
			semanticFrame = createFallbackSemanticFrame(request.message);
			trace?.recordError("SEMANTIC_PARSE_ERROR", "Semantic parsing failed; using fallback frame", semanticParseErrorDetails(cause));
		}
		trace?.recordSemanticFrame(semanticFrame);

		let runtime: AgentRuntime;
		try {
			runtime = this.runtimeFactory(context, trace?.telemetryContext, semanticFrame);
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
				semanticFrame,
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
