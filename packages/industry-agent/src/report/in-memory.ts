import type {
	ReportFormat,
	ReportPermissionInput,
	ReportPermissionService,
	ReportRenderer,
	ReportRendererOutput,
	ReportRendererRegistry,
	ReportRenderInput,
	ReportTraceEvent,
	ReportTraceSink,
} from "./types.ts";

export class InMemoryReportPermissionService implements ReportPermissionService {
	private readonly allowed: boolean;
	constructor(allowed = true) {
		this.allowed = allowed;
	}
	async authorize(_input: ReportPermissionInput): Promise<boolean> {
		return this.allowed;
	}
}

export class InMemoryReportRendererRegistry implements ReportRendererRegistry {
	private readonly byFormat = new Map<ReportFormat, ReportRenderer>();
	constructor(renderers: readonly ReportRenderer[]) {
		for (const renderer of renderers) this.byFormat.set(renderer.format, renderer);
	}
	get(format: ReportFormat): ReportRenderer | undefined {
		return this.byFormat.get(format);
	}
	list(): readonly ReportRenderer[] {
		return [...this.byFormat.values()];
	}
}

export class StaticReportRenderer implements ReportRenderer {
	readonly format: ReportFormat;
	readonly version: string;
	readonly inputs: ReportRenderInput[] = [];
	private readonly handler: (
		input: ReportRenderInput,
		signal: AbortSignal,
	) => Promise<ReportRendererOutput> | ReportRendererOutput;
	constructor(
		format: ReportFormat,
		version: string,
		handler: (input: ReportRenderInput, signal: AbortSignal) => Promise<ReportRendererOutput> | ReportRendererOutput,
	) {
		this.format = format;
		this.version = version;
		this.handler = handler;
	}
	async render(input: ReportRenderInput, signal: AbortSignal): Promise<ReportRendererOutput> {
		this.inputs.push(structuredClone(input));
		return this.handler(input, signal);
	}
}

export class InMemoryReportTraceSink implements ReportTraceSink {
	readonly events: ReportTraceEvent[] = [];
	record(event: ReportTraceEvent): void {
		this.events.push(structuredClone(event));
	}
}
