import type { RequestContext } from "../src/contracts/index.ts";
import {
	InMemoryReportPermissionService,
	InMemoryReportRendererRegistry,
	InMemoryReportTraceSink,
	ReportService,
	StaticReportRenderer,
	type ReportFormat,
	type ReportGenerationRequest,
	type ReportLimits,
	type ReportRendererOutput,
} from "../src/report/index.ts";

export const context: RequestContext = {
	traceId: "trace-1", requestId: "request-1", conversationId: "conversation-1", userId: "user-1", tenantId: "tenant-1", companyId: "company-1", projectId: "project-1", createdAt: "2026-09-12T00:00:00.000Z",
};

export const limits: ReportLimits = {
	maxFormats: 4, maxDatasets: 10, maxRowsPerDataset: 100, maxColumnsPerDataset: 20, maxCharts: 10, maxNarrativeSections: 20, maxCellChars: 1000, maxArtifactBytes: 100000, maxTotalArtifactBytes: 200000, renderTimeoutMs: 1000,
};

export function request(formats: readonly ReportFormat[] = ["EXCEL"]): ReportGenerationRequest {
	return {
		context,
		formats,
		model: {
			title: "项目进度报告",
			datasets: [{
				datasetId: "progress", name: "进度", scope: { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" },
				columns: [{ key: "name", label: "名称", type: "STRING" }, { key: "quantity", label: "数量", type: "NUMBER" }],
				rows: [{ name: "A", quantity: 10 }, { name: "B", quantity: 20 }], evidenceIds: ["fact-1"],
			}],
			charts: [{ chartId: "chart-1", title: "数量", type: "BAR", datasetId: "progress", categoryColumn: "name", valueColumns: ["quantity"], evidenceIds: ["fact-1"] }],
			narrative: [{ sectionId: "summary", heading: "摘要", body: "项目当前数量来自权威数据。", evidenceIds: ["fact-1"] }],
			evidence: [{ evidenceId: "fact-1", kind: "AUTHORITATIVE_TOOL", scope: { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" }, sourceId: "query_quantity:E1", sourceVersion: "v7", updatedAt: "2026-09-11T00:00:00.000Z" }],
		},
	};
}

function output(format: ReportFormat): Omit<ReportRendererOutput, "embeddedEvidenceIds"> {
	if (format === "EXCEL") return { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", hasFormulas: false, hasExternalLinks: false, hasRemoteResources: false, hasExecutableContent: false, hasRawHtml: false };
	if (format === "PDF") return { content: new TextEncoder().encode("%PDF-1.7\n%%EOF"), mimeType: "application/pdf", extension: "pdf", hasFormulas: false, hasExternalLinks: false, hasRemoteResources: false, hasExecutableContent: false, hasRawHtml: false };
	if (format === "CHART") return { content: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>'), mimeType: "image/svg+xml", extension: "svg", hasFormulas: false, hasExternalLinks: false, hasRemoteResources: false, hasExecutableContent: false, hasRawHtml: false };
	return { content: new TextEncoder().encode("# 摘要\n项目当前数量来自权威数据。"), mimeType: "text/markdown", extension: "md", hasFormulas: false, hasExternalLinks: false, hasRemoteResources: false, hasExecutableContent: false, hasRawHtml: false };
}

export function renderer(format: ReportFormat, override?: Partial<ReportRendererOutput>) {
	return new StaticReportRenderer(format, `${format.toLowerCase()}-renderer-v1`, (input) => ({ ...output(format), embeddedEvidenceIds: input.expectedEvidenceIds, ...override }));
}

export function service(options: { allowed?: boolean; formats?: readonly ReportFormat[]; customRenderers?: ReturnType<typeof renderer>[]; customLimits?: Partial<ReportLimits> } = {}) {
	const formats = options.formats ?? ["EXCEL", "PDF", "CHART", "NARRATIVE"];
	const renderers = options.customRenderers ?? formats.map((format) => renderer(format));
	const trace = new InMemoryReportTraceSink();
	let id = 0;
	return {
		trace,
		renderers,
		service: new ReportService({ permissions: new InMemoryReportPermissionService(options.allowed ?? true), renderers: new InMemoryReportRendererRegistry(renderers), limits: { ...limits, ...options.customLimits }, trace, idFactory: () => `id-${++id}`, now: () => new Date("2026-09-12T00:00:00.000Z") }),
	};
}
