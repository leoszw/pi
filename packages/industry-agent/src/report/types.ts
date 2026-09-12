import type { JsonObject, RequestContext, UIAction } from "../contracts/index.ts";

export type ReportFormat = "EXCEL" | "PDF" | "CHART" | "NARRATIVE";
export type ReportEvidenceKind = "AUTHORITATIVE_TOOL" | "RAG_CITATION" | "USER_PROVIDED" | "DERIVED";
export type ReportCellValue = string | number | boolean | null;
export type ReportColumnType = "STRING" | "NUMBER" | "BOOLEAN" | "DATE" | "DATETIME";
export type ReportChartType = "BAR" | "LINE" | "PIE";

export interface ReportScope {
	tenantId: string;
	companyId: string | null;
	projectId: string | null;
}

export interface ReportEvidence {
	evidenceId: string;
	kind: ReportEvidenceKind;
	scope: ReportScope;
	sourceId: string;
	sourceVersion: string;
	updatedAt?: string;
	parentEvidenceIds?: readonly string[];
	documentId?: string;
	chunkId?: string;
	page?: number | null;
	section?: string;
}

export interface ReportColumn {
	key: string;
	label: string;
	type: ReportColumnType;
}

export interface ReportDataset {
	datasetId: string;
	name: string;
	scope: ReportScope;
	columns: readonly ReportColumn[];
	rows: readonly Readonly<Record<string, ReportCellValue>>[];
	evidenceIds: readonly string[];
}

export interface ReportChartSpec {
	chartId: string;
	title: string;
	type: ReportChartType;
	datasetId: string;
	categoryColumn: string;
	valueColumns: readonly string[];
	evidenceIds: readonly string[];
}

export interface ReportNarrativeSection {
	sectionId: string;
	heading: string;
	body: string;
	evidenceIds: readonly string[];
}

export interface ReportModel {
	title: string;
	subtitle?: string;
	datasets: readonly ReportDataset[];
	charts: readonly ReportChartSpec[];
	narrative: readonly ReportNarrativeSection[];
	evidence: readonly ReportEvidence[];
	metadata?: JsonObject;
}

export interface ReportGenerationRequest {
	context: RequestContext;
	formats: readonly ReportFormat[];
	model: ReportModel;
}

export interface ReportPermissionInput {
	context: RequestContext;
	permission: "report.generate";
}

export interface ReportPermissionService {
	authorize(input: ReportPermissionInput): Promise<boolean>;
}

export interface ReportRendererSafetyContract {
	formulasAllowed: false;
	externalLinksAllowed: false;
	remoteResourcesAllowed: false;
	executableContentAllowed: false;
	rawHtmlAllowed: false;
	toolOrPromptInstructionsInDataAreUntrusted: true;
	spreadsheetStringsAreLiteral: true;
}

export interface ReportRenderInput {
	reportId: string;
	context: RequestContext;
	model: ReportModel;
	format: ReportFormat;
	expectedEvidenceIds: readonly string[];
	safety: ReportRendererSafetyContract;
}

export interface ReportRendererOutput {
	content: Uint8Array;
	mimeType: string;
	extension: string;
	fileName?: string;
	embeddedEvidenceIds: readonly string[];
	hasFormulas: boolean;
	hasExternalLinks: boolean;
	hasRemoteResources: boolean;
	hasExecutableContent: boolean;
	hasRawHtml: boolean;
}

export interface ReportRenderer {
	format: ReportFormat;
	version: string;
	render(input: ReportRenderInput, signal: AbortSignal): Promise<ReportRendererOutput>;
}

export interface ReportRendererRegistry {
	get(format: ReportFormat): ReportRenderer | undefined;
	list(): readonly ReportRenderer[];
}

export interface ReportArtifact {
	artifactId: string;
	reportId: string;
	format: ReportFormat;
	fileName: string;
	mimeType: string;
	extension: string;
	rendererVersion: string;
	checksumSha256: string;
	sizeBytes: number;
	content: Uint8Array;
	evidenceIds: readonly string[];
	createdAt: string;
}

export interface ReportGenerationResult {
	reportId: string;
	artifacts: readonly ReportArtifact[];
	uiActions: readonly UIAction[];
}

export interface ReportLimits {
	maxFormats: number;
	maxDatasets: number;
	maxRowsPerDataset: number;
	maxColumnsPerDataset: number;
	maxCharts: number;
	maxNarrativeSections: number;
	maxCellChars: number;
	maxArtifactBytes: number;
	maxTotalArtifactBytes: number;
	renderTimeoutMs: number;
}

export type ReportTraceStage = "AUTHORIZE" | "VALIDATE" | "RENDER_START" | "RENDER_END" | "COMPLETE";
export type ReportTraceStatus = "START" | "OK" | "ERROR" | "BLOCKED";

export interface ReportTraceEvent {
	traceId: string;
	requestId: string;
	reportId?: string;
	stage: ReportTraceStage;
	status: ReportTraceStatus;
	format?: ReportFormat;
	details?: JsonObject;
}

export interface ReportTraceSink {
	record(event: ReportTraceEvent): void;
}

export interface ReportServiceOptions {
	permissions: ReportPermissionService;
	renderers: ReportRendererRegistry;
	limits: ReportLimits;
	trace?: ReportTraceSink;
	idFactory?: () => string;
	now?: () => Date;
}
