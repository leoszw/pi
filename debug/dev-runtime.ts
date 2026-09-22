// Debug-only report builder and fail-closed placeholder for the M12 sandbox runtime.
//
// IMPORTANT: a local `python3` child process is NOT a production sandbox. It does not
// provide OS-enforced network/filesystem/process isolation, trustworthy CPU/memory
// accounting, or a production-grade runtime attestation. Keep this executor disabled
// until a real isolated runtime is wired in.
import {
	InMemoryReportPermissionService,
	InMemoryReportRendererRegistry,
	ReportService,
	StaticReportRenderer,
} from "../packages/industry-agent/src/report/index.ts";
import type { ReportLimits } from "../packages/industry-agent/src/report/types.ts";
import { IndustryAgentError } from "../packages/industry-agent/src/errors/industry-agent-error.ts";
import type {
	SandboxExecutor,
	SandboxExecutorInput,
	SandboxExecutorResult,
	SandboxReadCapability,
	SandboxReportBuilder,
	SandboxReportBuilderInput,
} from "../packages/industry-agent/src/sandbox/index.ts";

const REPORT_LIMITS: ReportLimits = {
	maxFormats: 4,
	maxDatasets: 10,
	maxRowsPerDataset: 100,
	maxColumnsPerDataset: 20,
	maxCharts: 10,
	maxNarrativeSections: 20,
	maxCellChars: 1000,
	maxArtifactBytes: 100000,
	maxTotalArtifactBytes: 200000,
	renderTimeoutMs: 1000,
};

/**
 * Fail-closed development executor.
 *
 * The previous implementation spawned local Python and then returned a production
 * safety attestation claiming network/filesystem/process isolation, zero memory use,
 * and CPU accounting even though those guarantees were not actually enforced or
 * measured. That made an unsafe debug process indistinguishable from a trusted
 * SandboxExecutor to SandboxAnalysisService.
 *
 * Do not replace this guard with fabricated attestation flags. Development execution
 * should be re-enabled only through a runtime that can truthfully satisfy the
 * SandboxRuntimeSafetyContract.
 */
export class DevPythonSandboxExecutor implements SandboxExecutor {
	async execute(
		_input: SandboxExecutorInput,
		_dataAccess: SandboxReadCapability,
		_signal: AbortSignal,
	): Promise<SandboxExecutorResult> {
		throw new IndustryAgentError(
			"SANDBOX_EXECUTION_FAILED",
			"Development Python runtime is disabled because local python3 does not satisfy the production sandbox isolation and attestation contract",
		);
	}
}

export class DevReportBuilder implements SandboxReportBuilder {
	private readonly service: ReportService;
	private counter = 0;

	constructor() {
		const narrativeRenderer = new StaticReportRenderer("NARRATIVE", "dev-markdown-v1", (input) => {
			const lines: string[] = [`# ${input.model.title}`];
			for (const section of input.model.narrative) lines.push("", `## ${section.heading}`, "", section.body);
			for (const dataset of input.model.datasets) {
				lines.push("", `### ${dataset.name}`, "");
				lines.push(`| ${dataset.columns.map((column) => column.label).join(" | ")} |`);
				lines.push(`| ${dataset.columns.map(() => "---").join(" | ")} |`);
				for (const row of dataset.rows)
					lines.push(`| ${dataset.columns.map((column) => String(row[column.key] ?? "")).join(" | ")} |`);
			}
			return {
				content: new TextEncoder().encode(lines.join("\n")),
				mimeType: "text/markdown",
				extension: "md",
				embeddedEvidenceIds: [...input.expectedEvidenceIds],
				hasFormulas: false,
				hasExternalLinks: false,
				hasRemoteResources: false,
				hasExecutableContent: false,
				hasRawHtml: false,
			};
		});
		this.service = new ReportService({
			permissions: new InMemoryReportPermissionService(true),
			renderers: new InMemoryReportRendererRegistry([narrativeRenderer]),
			limits: REPORT_LIMITS,
			idFactory: () => `rep-${++this.counter}`,
			now: () => new Date(),
		});
	}

	async build(input: SandboxReportBuilderInput) {
		const scope = {
			tenantId: input.context.tenantId,
			companyId: input.context.companyId ?? null,
			projectId: input.context.projectId ?? null,
		};
		const evidence = input.brokerResults.flatMap((result) =>
			result.evidence.map((item) => ({
				evidenceId: item.evidenceId,
				kind: "AUTHORITATIVE_TOOL" as const,
				scope,
				sourceId: item.sourceId,
				sourceVersion: item.sourceVersion,
				...(item.updatedAt !== undefined ? { updatedAt: item.updatedAt } : {}),
			})),
		);
		const model = {
			title: input.reportTitle,
			datasets: input.output.tables.map((table) => ({
				datasetId: table.tableId,
				name: table.name,
				scope,
				columns: table.columns.map((column) => ({ ...column })),
				rows: table.rows.map((row) => ({ ...row })),
				evidenceIds: table.sourceQueryIds.map((queryId) => `ev-${queryId}`),
			})),
			charts: input.output.charts.map((chart) => ({
				chartId: chart.chartId,
				title: chart.title,
				type: chart.type,
				datasetId: chart.tableId,
				categoryColumn: chart.categoryColumn,
				valueColumns: [...chart.valueColumns],
				evidenceIds: chart.sourceQueryIds.map((queryId) => `ev-${queryId}`),
			})),
			narrative: input.output.narrative.map((section) => ({
				sectionId: section.sectionId,
				heading: section.heading,
				body: section.body,
				evidenceIds: section.sourceQueryIds.map((queryId) => `ev-${queryId}`),
			})),
			evidence,
		};
		return this.service.generate({ context: input.context, formats: [...input.formats], model });
	}
}
