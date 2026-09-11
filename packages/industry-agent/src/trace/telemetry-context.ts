import {
	NOOP_TELEMETRY_CONTEXT,
	type SpanAttributes,
	type SpanOptions,
	type SpanStatus,
	type TelemetryContext,
	type TelemetrySpan,
} from "@earendil-works/pi-agent-core";

export interface TraceTelemetrySink {
	startTelemetrySpan(parentSpanId: string | undefined, options: SpanOptions): string;
	addTelemetryEvent(spanId: string, name: string, attributes?: SpanAttributes): void;
	setTelemetryAttributes(spanId: string, attributes: SpanAttributes): void;
	setTelemetryStatus(spanId: string, status: SpanStatus): void;
	endTelemetrySpan(spanId: string, failed: boolean, error?: unknown): void;
}

class PersistentTelemetrySpan implements TelemetrySpan {
	private readonly sink: TraceTelemetrySink;
	private readonly spanId: string;
	private settled = false;

	constructor(sink: TraceTelemetrySink, spanId: string) {
		this.sink = sink;
		this.spanId = spanId;
	}

	startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
		if (this.settled) {
			return NOOP_TELEMETRY_CONTEXT.startSpan(options, callback);
		}
		return runPersistentSpan(this.sink, this.spanId, options, callback);
	}

	addEvent(name: string, attributes?: SpanAttributes): void {
		if (!this.settled) {
			this.sink.addTelemetryEvent(this.spanId, name, attributes);
		}
	}

	setAttributes(attributes: SpanAttributes): void {
		if (!this.settled) {
			this.sink.setTelemetryAttributes(this.spanId, attributes);
		}
	}

	setStatus(status: SpanStatus): void {
		if (!this.settled) {
			this.sink.setTelemetryStatus(this.spanId, status);
		}
	}

	settle(): void {
		this.settled = true;
	}
}

async function runPersistentSpan<T>(
	sink: TraceTelemetrySink,
	parentSpanId: string | undefined,
	options: SpanOptions,
	callback: (span: TelemetrySpan) => T | Promise<T>,
): Promise<T> {
	const spanId = sink.startTelemetrySpan(parentSpanId, options);
	const span = new PersistentTelemetrySpan(sink, spanId);
	try {
		const result = await callback(span);
		sink.endTelemetrySpan(spanId, false);
		return result;
	} catch (error) {
		sink.endTelemetrySpan(spanId, true, error);
		throw error;
	} finally {
		span.settle();
	}
}

export class PersistentTraceTelemetryContext implements TelemetryContext {
	private readonly sink: TraceTelemetrySink;
	private readonly parentSpanId?: string;

	constructor(sink: TraceTelemetrySink, parentSpanId?: string) {
		this.sink = sink;
		this.parentSpanId = parentSpanId;
	}

	startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
		return runPersistentSpan(this.sink, this.parentSpanId, options, callback);
	}
}
