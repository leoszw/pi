import type { JsonObject, RequestContext } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type {
	ReportChartSpec,
	ReportDataset,
	ReportEvidence,
	ReportFormat,
	ReportGenerationRequest,
	ReportLimits,
	ReportModel,
	ReportNarrativeSection,
	ReportRendererOutput,
	ReportScope,
} from "./types.ts";

const FORMATS = new Set<ReportFormat>(["EXCEL", "PDF", "CHART", "NARRATIVE"]);
const EVIDENCE_KINDS = new Set(["AUTHORITATIVE_TOOL", "RAG_CITATION", "USER_PROVIDED", "DERIVED"]);
const COLUMN_TYPES = new Set(["STRING", "NUMBER", "BOOLEAN", "DATE", "DATETIME"]);
const CHART_TYPES = new Set(["BAR", "LINE", "PIE"]);
const MIME_BY_FORMAT: Readonly<Record<ReportFormat, readonly string[]>> = {
	EXCEL: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
	PDF: ["application/pdf"],
	CHART: ["image/svg+xml", "image/png"],
	NARRATIVE: ["text/markdown", "text/plain"],
};
const EXTENSION_BY_FORMAT: Readonly<Record<ReportFormat, readonly string[]>> = {
	EXCEL: ["xlsx"], PDF: ["pdf"], CHART: ["svg", "png"], NARRATIVE: ["md", "txt"],
};

function text(value: string, label: string, max = 500): string {
	const clean = value.trim();
	if (!clean) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} must not be empty`);
	if (clean.length > max) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `${label} exceeds ${max} characters`);
	return clean;
}

function unique(values: readonly string[], label: string): void {
	const normalized = values.map((item) => text(item, label, 256));
	if (new Set(normalized).size !== normalized.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} contains duplicates`);
}

function requestScope(context: RequestContext): ReportScope {
	return { tenantId: context.tenantId, companyId: context.companyId ?? null, projectId: context.projectId ?? null };
}

function sameScope(left: ReportScope, right: ReportScope): boolean {
	return left.tenantId === right.tenantId && left.companyId === right.companyId && left.projectId === right.projectId;
}

export function validateReportLimits(limits: ReportLimits): ReportLimits {
	const integerFields: readonly (keyof ReportLimits)[] = [
		"maxFormats", "maxDatasets", "maxRowsPerDataset", "maxColumnsPerDataset", "maxCharts", "maxNarrativeSections", "maxCellChars", "maxArtifactBytes", "maxTotalArtifactBytes", "renderTimeoutMs",
	];
	for (const field of integerFields) {
		const value = limits[field];
		if (!Number.isInteger(value) || value <= 0) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${field} must be a positive integer`);
	}
	if (limits.maxFormats > FORMATS.size) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `maxFormats cannot exceed ${FORMATS.size}`);
	if (limits.maxTotalArtifactBytes < limits.maxArtifactBytes) throw new IndustryAgentError("REPORT_INVALID_REQUEST", "maxTotalArtifactBytes must be >= maxArtifactBytes");
	return limits;
}

function validateScope(context: RequestContext, scope: ReportScope, label: string): void {
	text(scope.tenantId, `${label} tenantId`, 256);
	if (scope.companyId !== null) text(scope.companyId, `${label} companyId`, 256);
	if (scope.projectId !== null) text(scope.projectId, `${label} projectId`, 256);
	if (!sameScope(requestScope(context), scope)) throw new IndustryAgentError("REPORT_SCOPE_MISMATCH", `${label} escaped request tenant/company/project scope`);
}

function validateEvidence(context: RequestContext, evidence: readonly ReportEvidence[]): ReadonlyMap<string, ReportEvidence> {
	const map = new Map<string, ReportEvidence>();
	for (const item of evidence) {
		const id = text(item.evidenceId, "evidenceId", 256);
		if (map.has(id)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Duplicate evidence id: ${id}`);
		validateScope(context, item.scope, `Evidence ${id}`);
		if (!EVIDENCE_KINDS.has(item.kind)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Evidence ${id} has unsupported kind: ${String(item.kind)}`);
		text(item.sourceId, `Evidence ${id} sourceId`, 512);
		text(item.sourceVersion, `Evidence ${id} sourceVersion`, 256);
		if (item.updatedAt !== undefined && Number.isNaN(Date.parse(item.updatedAt))) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Evidence ${id} updatedAt must be an ISO datetime`);
		if (item.kind === "RAG_CITATION") {
			if (!item.documentId || !item.chunkId || item.page === undefined || !item.section) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `RAG evidence ${id} requires documentId, chunkId, page, and section`);
			text(item.documentId, `RAG evidence ${id} documentId`, 256); text(item.chunkId, `RAG evidence ${id} chunkId`, 256); text(item.section, `RAG evidence ${id} section`, 1000);
			if (item.page !== null && (!Number.isInteger(item.page) || item.page <= 0)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `RAG evidence ${id} page must be positive or null`);
		}
		if (item.kind === "DERIVED") {
			if (!item.parentEvidenceIds?.length) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Derived evidence ${id} requires parentEvidenceIds`);
			unique(item.parentEvidenceIds, `Derived evidence ${id} parentEvidenceIds`);
		}
		map.set(id, item);
	}
	for (const item of evidence) {
		for (const parentId of item.parentEvidenceIds ?? []) if (!map.has(parentId)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Evidence ${item.evidenceId} references unknown parent ${parentId}`);
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visited.has(id)) return;
		if (visiting.has(id)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Evidence lineage contains a cycle at ${id}`);
		visiting.add(id);
		for (const parentId of map.get(id)?.parentEvidenceIds ?? []) visit(parentId);
		visiting.delete(id); visited.add(id);
	};
	for (const id of map.keys()) visit(id);
	return map;
}

function requireEvidence(ids: readonly string[], evidence: ReadonlyMap<string, ReportEvidence>, label: string): void {
	if (!ids.length) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `${label} must cite at least one evidence id`);
	unique(ids, `${label} evidenceIds`);
	for (const id of ids) if (!evidence.has(id)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `${label} references unknown evidence: ${id}`);
}

function validateCellType(value: unknown, type: ReportDataset["columns"][number]["type"], label: string): void {
	if (value === null) return;
	if (type === "STRING" && typeof value !== "string") throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} must be a string or null`);
	if (type === "NUMBER" && (typeof value !== "number" || !Number.isFinite(value))) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} must be a finite number or null`);
	if (type === "BOOLEAN" && typeof value !== "boolean") throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} must be a boolean or null`);
	if (type === "DATE") {
		if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} must be an ISO date or null`);
	}
	if (type === "DATETIME") {
		if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `${label} must be an ISO datetime or null`);
	}
}

function validateDataset(context: RequestContext, dataset: ReportDataset, evidence: ReadonlyMap<string, ReportEvidence>, limits: ReportLimits): void {
	const id = text(dataset.datasetId, "datasetId", 256);
	text(dataset.name, `Dataset ${id} name`, 500);
	validateScope(context, dataset.scope, `Dataset ${id}`);
	if (!dataset.columns.length || dataset.columns.length > limits.maxColumnsPerDataset) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `Dataset ${id} column count is outside allowed range`);
	if (dataset.rows.length > limits.maxRowsPerDataset) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `Dataset ${id} exceeds max rows ${limits.maxRowsPerDataset}`);
	const keys = dataset.columns.map((column) => text(column.key, `Dataset ${id} column key`, 128));
	if (new Set(keys).size !== keys.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Dataset ${id} has duplicate column keys`);
	for (const column of dataset.columns) {
		text(column.label, `Dataset ${id} column label`, 256);
		if (!COLUMN_TYPES.has(column.type)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Dataset ${id} has unsupported column type: ${String(column.type)}`);
	}
	const allowed = new Set(keys);
	const columns = new Map(dataset.columns.map((column) => [column.key, column] as const));
	for (const [rowIndex, row] of dataset.rows.entries()) {
		for (const key of Object.keys(row)) if (!allowed.has(key)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Dataset ${id} row ${rowIndex} contains undeclared field: ${key}`);
		for (const [key, value] of Object.entries(row)) {
			const column = columns.get(key)!;
			validateCellType(value, column.type, `Dataset ${id} row ${rowIndex} field ${key}`);
			if (typeof value === "string" && value.length > limits.maxCellChars) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `Dataset ${id} row ${rowIndex} field ${key} exceeds max cell characters`);
		}
	}
	requireEvidence(dataset.evidenceIds, evidence, `Dataset ${id}`);
}

function validateChart(chart: ReportChartSpec, datasets: ReadonlyMap<string, ReportDataset>, evidence: ReadonlyMap<string, ReportEvidence>): void {
	const id = text(chart.chartId, "chartId", 256);
	text(chart.title, `Chart ${id} title`, 500);
	if (!CHART_TYPES.has(chart.type)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Chart ${id} has unsupported type: ${String(chart.type)}`);
	const dataset = datasets.get(chart.datasetId);
	if (!dataset) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Chart ${id} references unknown dataset: ${chart.datasetId}`);
	const columns = new Set(dataset.columns.map((item) => item.key));
	if (!columns.has(chart.categoryColumn)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Chart ${id} category column is unknown: ${chart.categoryColumn}`);
	if (!chart.valueColumns.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Chart ${id} requires at least one value column`);
	if (chart.type === "PIE" && chart.valueColumns.length !== 1) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `PIE chart ${id} requires exactly one value column`);
	unique(chart.valueColumns, `Chart ${id} valueColumns`);
	const columnTypes = new Map(dataset.columns.map((item) => [item.key, item.type] as const));
	for (const valueColumn of chart.valueColumns) {
		if (!columns.has(valueColumn)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Chart ${id} value column is unknown: ${valueColumn}`);
		if (columnTypes.get(valueColumn) !== "NUMBER") throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Chart ${id} value column must be NUMBER: ${valueColumn}`);
	}
	requireEvidence(chart.evidenceIds, evidence, `Chart ${id}`);
	for (const evidenceId of chart.evidenceIds) if (!dataset.evidenceIds.includes(evidenceId)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `Chart ${id} evidence must come from its dataset`);
}

function validateNarrative(section: ReportNarrativeSection, evidence: ReadonlyMap<string, ReportEvidence>, limits: ReportLimits): void {
	const id = text(section.sectionId, "sectionId", 256);
	text(section.heading, `Narrative ${id} heading`, 500);
	const body = text(section.body, `Narrative ${id} body`, limits.maxCellChars * 5);
	if (/<\/?[A-Za-z][^>]*>/.test(body)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Narrative ${id} contains raw HTML`);
	requireEvidence(section.evidenceIds, evidence, `Narrative ${id}`);
}

export function validateReportRequest(request: ReportGenerationRequest, limits: ReportLimits): ReportGenerationRequest {
	text(request.context.traceId, "traceId", 256); text(request.context.requestId, "requestId", 256); text(request.context.userId, "userId", 256); text(request.context.tenantId, "tenantId", 256);
	if (request.context.companyId !== undefined) text(request.context.companyId, "companyId", 256);
	if (request.context.projectId !== undefined) text(request.context.projectId, "projectId", 256);
	if (!request.formats.length || request.formats.length > limits.maxFormats) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", "Requested report format count is outside allowed range");
	if (new Set(request.formats).size !== request.formats.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", "Requested report formats must be unique");
	for (const format of request.formats) if (!FORMATS.has(format)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Unsupported report format: ${String(format)}`);
	const model = request.model;
	text(model.title, "report title", 500);
	if (model.subtitle) text(model.subtitle, "report subtitle", 1000);
	if (model.datasets.length > limits.maxDatasets) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `Report exceeds max datasets ${limits.maxDatasets}`);
	if (model.charts.length > limits.maxCharts) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `Report exceeds max charts ${limits.maxCharts}`);
	if (model.narrative.length > limits.maxNarrativeSections) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `Report exceeds max narrative sections ${limits.maxNarrativeSections}`);
	const evidence = validateEvidence(request.context, model.evidence);
	const datasets = new Map<string, ReportDataset>();
	for (const dataset of model.datasets) {
		validateDataset(request.context, dataset, evidence, limits);
		if (datasets.has(dataset.datasetId)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Duplicate dataset id: ${dataset.datasetId}`);
		datasets.set(dataset.datasetId, dataset);
	}
	const chartIds = new Set<string>();
	for (const chart of model.charts) {
		validateChart(chart, datasets, evidence);
		if (chartIds.has(chart.chartId)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Duplicate chart id: ${chart.chartId}`);
		chartIds.add(chart.chartId);
	}
	const sectionIds = new Set<string>();
	for (const section of model.narrative) {
		validateNarrative(section, evidence, limits);
		if (sectionIds.has(section.sectionId)) throw new IndustryAgentError("REPORT_INVALID_REQUEST", `Duplicate narrative section id: ${section.sectionId}`);
		sectionIds.add(section.sectionId);
	}
	if (request.formats.includes("EXCEL") && !model.datasets.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", "EXCEL output requires at least one dataset");
	if (request.formats.includes("CHART") && !model.charts.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", "CHART output requires at least one chart spec");
	if (request.formats.includes("NARRATIVE") && !model.narrative.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", "NARRATIVE output requires at least one grounded narrative section");
	if (request.formats.includes("PDF") && !model.datasets.length && !model.charts.length && !model.narrative.length) throw new IndustryAgentError("REPORT_INVALID_REQUEST", "PDF output requires report content");
	return request;
}

export function expectedEvidenceIds(model: ReportModel, format: ReportFormat): readonly string[] {
	const ids = new Set<string>();
	if (format === "EXCEL") for (const dataset of model.datasets) for (const id of dataset.evidenceIds) ids.add(id);
	else if (format === "CHART") for (const chart of model.charts) for (const id of chart.evidenceIds) ids.add(id);
	else if (format === "NARRATIVE") for (const section of model.narrative) for (const id of section.evidenceIds) ids.add(id);
	else {
		for (const dataset of model.datasets) for (const id of dataset.evidenceIds) ids.add(id);
		for (const chart of model.charts) for (const id of chart.evidenceIds) ids.add(id);
		for (const section of model.narrative) for (const id of section.evidenceIds) ids.add(id);
	}
	return [...ids].sort();
}

function startsWithBytes(content: Uint8Array, bytes: readonly number[]): boolean {
	return bytes.every((value, index) => content[index] === value);
}

function utf8(content: Uint8Array): string { return new TextDecoder().decode(content); }

function validateArtifactSignature(format: ReportFormat, output: ReportRendererOutput): void {
	if (format === "EXCEL") {
		if (!startsWithBytes(output.content, [0x50, 0x4b])) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "EXCEL artifact must be an OOXML ZIP payload");
		const content = utf8(output.content);
		if (/vbaProject\.bin|xl\/externalLinks\//i.test(content)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "EXCEL artifact contains macro or external-link parts");
	}
	if (format === "PDF") {
		const content = utf8(output.content);
		if (!content.startsWith("%PDF-")) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "PDF artifact has an invalid signature");
		if (/\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile)\b|\/URI\s*\(/i.test(content)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "PDF artifact contains active or external content");
	}
	if (format === "CHART" && output.mimeType === "image/png" && !startsWithBytes(output.content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "PNG chart has an invalid signature");
	if (format === "CHART" && output.mimeType === "image/svg+xml") {
		const content = utf8(output.content).trim().replace(/^<\?xml[^>]*>\s*/i, "");
		if (!/^<svg\b/i.test(content)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "SVG chart has an invalid root element");
		if (/<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|xlink:href)\s*=\s*["\'](?:https?:|data:|javascript:)|url\(\s*["\']?https?:/i.test(content)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "SVG chart contains active or external content");
	}
	if (format === "NARRATIVE") {
		const content = utf8(output.content);
		if (/<\/?[A-Za-z][^>]*>/.test(content)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", "Narrative artifact contains raw HTML");
	}
}

function validateArtifactFileName(fileName: string, extension: string, format: ReportFormat): string {
	const clean = text(fileName, `${format} artifact fileName`, 255);
	if (/[\\/\u0000-\u001f]/.test(clean) || clean === "." || clean === "..") throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", `${format} artifact fileName is unsafe`);
	if (!clean.toLowerCase().endsWith(`.${extension}`)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", `${format} artifact fileName extension does not match renderer output`);
	return clean;
}

export function validateRendererOutput(format: ReportFormat, output: ReportRendererOutput, maxArtifactBytes: number, expectedEvidenceIds: readonly string[]): ReportRendererOutput {
	if (!(output.content instanceof Uint8Array) || output.content.byteLength <= 0) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", `${format} renderer returned empty content`);
	if (output.content.byteLength > maxArtifactBytes) throw new IndustryAgentError("REPORT_LIMIT_EXCEEDED", `${format} artifact exceeds max artifact bytes ${maxArtifactBytes}`);
	if (!MIME_BY_FORMAT[format].includes(output.mimeType)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", `${format} renderer returned invalid MIME type: ${output.mimeType}`);
	const extension = output.extension.trim().toLowerCase().replace(/^\./, "");
	if (!EXTENSION_BY_FORMAT[format].includes(extension)) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", `${format} renderer returned invalid extension: ${output.extension}`);
	if (output.hasFormulas || output.hasExternalLinks || output.hasRemoteResources || output.hasExecutableContent || output.hasRawHtml) throw new IndustryAgentError("REPORT_ARTIFACT_INVALID", `${format} renderer violated safe artifact policy`);
	unique(output.embeddedEvidenceIds, `${format} embeddedEvidenceIds`);
	const embedded = new Set(output.embeddedEvidenceIds);
	for (const evidenceId of expectedEvidenceIds) if (!embedded.has(evidenceId)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `${format} artifact did not embed required evidence: ${evidenceId}`);
	for (const evidenceId of output.embeddedEvidenceIds) if (!expectedEvidenceIds.includes(evidenceId)) throw new IndustryAgentError("REPORT_LINEAGE_INVALID", `${format} artifact embedded unexpected evidence: ${evidenceId}`);
	validateArtifactSignature(format, output);
	return { ...output, extension, ...(output.fileName === undefined ? {} : { fileName: validateArtifactFileName(output.fileName, extension, format) }) };
}

export function reportTraceDetails(details: Readonly<Record<string, unknown>>): JsonObject {
	return { ...details };
}
