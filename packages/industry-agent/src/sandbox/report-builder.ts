import type { RequestContext } from "../contracts/index.ts";
import type { ReportEvidence, ReportGenerationRequest, ReportGenerationResult, ReportModel, ReportScope } from "../report/types.ts";
import type { SandboxBrokerResult, SandboxReportBuilder, SandboxReportBuilderInput } from "./types.ts";

export interface SandboxReportGenerator {
	generate(request: ReportGenerationRequest): Promise<ReportGenerationResult>;
}

function scope(context: RequestContext): ReportScope {
	return { tenantId: context.tenantId, companyId: context.companyId ?? null, projectId: context.projectId ?? null };
}

function brokerEvidenceId(queryId: string, evidenceId: string): string {
	return `broker:${queryId}:${evidenceId}`;
}

function parentEvidenceIds(queryIds: readonly string[], results: ReadonlyMap<string, SandboxBrokerResult>): readonly string[] {
	const ids = new Set<string>();
	for (const queryId of queryIds) {
		const result = results.get(queryId);
		if (!result) continue;
		for (const evidence of result.evidence) ids.add(brokerEvidenceId(queryId, evidence.evidenceId));
	}
	return [...ids].sort();
}

export class SandboxReportServiceBuilder implements SandboxReportBuilder {
	private readonly generator: SandboxReportGenerator;

	constructor(generator: SandboxReportGenerator) {
		this.generator = generator;
	}

	async build(input: SandboxReportBuilderInput): Promise<ReportGenerationResult> {
		const resultMap = new Map(input.brokerResults.map((result) => [result.queryId, result] as const));
		const reportScope = scope(input.context);
		const evidence: ReportEvidence[] = [];
		for (const result of input.brokerResults) {
			for (const item of result.evidence) {
				evidence.push({
					evidenceId: brokerEvidenceId(result.queryId, item.evidenceId),
					kind: "AUTHORITATIVE_TOOL",
					scope: reportScope,
					sourceId: `read-only-broker:${item.sourceId}`,
					sourceVersion: item.sourceVersion,
					...(item.updatedAt === undefined ? {} : { updatedAt: item.updatedAt }),
				});
			}
		}

		const datasets = input.output.tables.map((table) => {
			const parents = parentEvidenceIds(table.sourceQueryIds, resultMap);
			const derivedId = `sandbox:${input.program.programId}:table:${table.tableId}`;
			evidence.push({
				evidenceId: derivedId,
				kind: "DERIVED",
				scope: reportScope,
				sourceId: `sandbox-program:${input.program.programId}`,
				sourceVersion: input.runtimeVersion,
				parentEvidenceIds: parents,
			});
			return { datasetId: table.tableId, name: table.name, scope: reportScope, columns: table.columns, rows: table.rows, evidenceIds: [derivedId] };
		});

		const datasetEvidence = new Map(datasets.map((dataset) => [dataset.datasetId, dataset.evidenceIds] as const));
		const charts = input.output.charts.map((chart) => ({
			chartId: chart.chartId,
			title: chart.title,
			type: chart.type,
			datasetId: chart.tableId,
			categoryColumn: chart.categoryColumn,
			valueColumns: chart.valueColumns,
			evidenceIds: datasetEvidence.get(chart.tableId) ?? [],
		}));

		const narrative = input.output.narrative.map((section) => {
			const parents = parentEvidenceIds(section.sourceQueryIds, resultMap);
			const derivedId = `sandbox:${input.program.programId}:narrative:${section.sectionId}`;
			evidence.push({
				evidenceId: derivedId,
				kind: "DERIVED",
				scope: reportScope,
				sourceId: `sandbox-program:${input.program.programId}`,
				sourceVersion: input.runtimeVersion,
				parentEvidenceIds: parents,
			});
			return { sectionId: section.sectionId, heading: section.heading, body: section.body, evidenceIds: [derivedId] };
		});

		const allQueryIds = input.brokerResults.map((result) => result.queryId);
		const summaryParents = parentEvidenceIds(allQueryIds, resultMap);
		if (summaryParents.length) {
			const summaryId = `sandbox:${input.program.programId}:verification`;
			evidence.push({
				evidenceId: summaryId,
				kind: "DERIVED",
				scope: reportScope,
				sourceId: `sandbox-verifier:${input.program.programId}`,
				sourceVersion: input.runtimeVersion,
				parentEvidenceIds: summaryParents,
			});
			narrative.push({ sectionId: "sandbox-verification", heading: "Analysis Summary", body: input.verificationSummary, evidenceIds: [summaryId] });
		}

		const model: ReportModel = {
			title: input.reportTitle,
			subtitle: input.goal,
			datasets,
			charts,
			narrative,
			evidence,
			metadata: { sandboxProgramId: input.program.programId, sandboxRuntimeVersion: input.runtimeVersion, queryIds: allQueryIds },
		};
		return this.generator.generate({ context: input.context, formats: input.formats, model });
	}
}
