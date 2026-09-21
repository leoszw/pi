// Debug-only sandbox runtime: executes validated Python via local python3 and
// bridges read(queryId) to the server-side broker over stdio JSON lines.
// NOT the production isolation boundary: no network/filesystem/process enforcement.
// Actual guards at debug time: static validation + read-only MySQL account.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
	InMemoryReportPermissionService,
	InMemoryReportRendererRegistry,
	ReportService,
	StaticReportRenderer,
} from "../packages/industry-agent/src/report/index.ts";
import type { ReportLimits } from "../packages/industry-agent/src/report/types.ts";
import type {
	SandboxExecutionOutput,
	SandboxExecutor,
	SandboxExecutorInput,
	SandboxExecutorResult,
	SandboxReadCapability,
	SandboxReportBuilder,
	SandboxReportBuilderInput,
	SandboxRuntimeSafetyClaims,
} from "../packages/industry-agent/src/sandbox/index.ts";
import { pythonSha256 } from "../packages/industry-agent/src/sandbox/validation.ts";

const BOOTSTRAP_PY = `import sys, json

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")

def _emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\\n")
    sys.stdout.flush()

def _read(query_id):
    _emit({"op": "read", "queryId": query_id})
    line = sys.stdin.readline()
    if not line:
        raise RuntimeError("sandbox bridge closed")
    payload = json.loads(line)
    if "error" in payload:
        raise RuntimeError(str(payload["error"]))
    return payload

with open("program.py", "r", encoding="utf-8") as f:
    source = f.read()
namespace = {"__name__": "__main__"}
exec(compile(source, "program.py", "exec"), namespace)
main = namespace.get("main")
if main is None:
    raise RuntimeError("program must define main(read)")
_emit({"__result__": main(_read)})
`;

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

const DEV_RUNTIME_SAFETY: SandboxRuntimeSafetyClaims = {
	networkDisabled: false,
	filesystemDisabled: false,
	processSpawnDisabled: false,
	environmentSecretsExposed: false,
	importsDisabled: false,
	dynamicCodeDisabled: false,
	dataAccessMode: "QUERY_ID_ONLY",
	abortTerminatesExecution: true,
};

function assertRequestedSafety(input: SandboxExecutorInput): void {
	const requested = input.safety;
	if (
		requested.networkDisabled !== DEV_RUNTIME_SAFETY.networkDisabled ||
		requested.filesystemDisabled !== DEV_RUNTIME_SAFETY.filesystemDisabled ||
		requested.processSpawnDisabled !== DEV_RUNTIME_SAFETY.processSpawnDisabled ||
		requested.environmentSecretsExposed !== DEV_RUNTIME_SAFETY.environmentSecretsExposed ||
		requested.importsDisabled !== DEV_RUNTIME_SAFETY.importsDisabled ||
		requested.dynamicCodeDisabled !== DEV_RUNTIME_SAFETY.dynamicCodeDisabled ||
		requested.dataAccessMode !== DEV_RUNTIME_SAFETY.dataAccessMode ||
		requested.abortTerminatesExecution !== DEV_RUNTIME_SAFETY.abortTerminatesExecution
	) {
		throw new Error(
			"DevPythonSandboxExecutor does not satisfy the requested production sandbox safety contract; use an isolated executor instead",
		);
	}
}

export class DevPythonSandboxExecutor implements SandboxExecutor {
	readonly safety: SandboxRuntimeSafetyClaims = DEV_RUNTIME_SAFETY;

	async execute(
		input: SandboxExecutorInput,
		dataAccess: SandboxReadCapability,
		signal: AbortSignal,
	): Promise<SandboxExecutorResult> {
		assertRequestedSafety(input);
		const startedAtMs = Date.now();
		const dir = mkdtempSync(join(tmpdir(), "pi-sandbox-"));
		try {
			writeFileSync(join(dir, "program.py"), input.python, "utf8");
			writeFileSync(join(dir, "bootstrap.py"), BOOTSTRAP_PY, "utf8");
			const output = await this.runProcess(dir, dataAccess, signal);
			// Debug approximation: wall-clock time stands in for CPU time, memory is reported as 0.
			return {
				output,
				attestation: {
					runtimeVersion: "dev-python3-v1",
					executedPythonSha256: pythonSha256(input.python),
					cpuTimeMs: Date.now() - startedAtMs,
					memoryPeakBytes: 0,
					...DEV_RUNTIME_SAFETY,
				},
			};
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	private runProcess(
		dir: string,
		dataAccess: SandboxReadCapability,
		signal: AbortSignal,
	): Promise<SandboxExecutionOutput> {
		return new Promise<SandboxExecutionOutput>((resolve, reject) => {
			const child = spawn("python3", ["bootstrap.py"], {
				cwd: dir,
				env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: dir, LANG: "C.UTF-8", PYTHONUTF8: "1" },
				stdio: ["pipe", "pipe", "pipe"],
			});
			let stderr = "";
			let settled = false;
			const finish = (error: unknown, output?: SandboxExecutionOutput) => {
				if (settled) return;
				settled = true;
				if (!child.killed) child.kill("SIGKILL");
				if (error) reject(error instanceof Error ? error : new Error(String(error)));
				else resolve(output!);
			};
			const onAbort = () => finish(new Error("sandbox execution aborted"));
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			child.on("error", (error) => finish(error));
			child.on("close", (code) => {
				if (!settled) finish(new Error(`python exited with code ${code}: ${stderr.slice(-2000)}`));
			});
			const stdout = child.stdout.setEncoding("utf8");
			const reader = createInterface({ input: stdout });
			reader.on("line", (line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				let message: Record<string, unknown>;
				try {
					message = JSON.parse(trimmed) as Record<string, unknown>;
				} catch {
					return finish(new Error(`non-JSON sandbox output: ${trimmed.slice(0, 200)}`));
				}
				if (typeof message["__result__"] !== "undefined") {
					reader.close();
					finish(undefined, this.normalizeOutput(message["__result__"]));
					return;
				}
				if (message["op"] === "read" && typeof message["queryId"] === "string") {
					void dataAccess
						.read(message["queryId"])
						.then((dataset) => {
							child.stdin.write(`${JSON.stringify({ columns: dataset.columns, rows: dataset.rows })}\n`);
						})
						.catch((error: unknown) => {
							child.stdin.write(
								`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
							);
						});
					return;
				}
				finish(new Error(`unknown sandbox message: ${trimmed.slice(0, 200)}`));
			});
		});
	}

	private normalizeOutput(raw: unknown): SandboxExecutionOutput {
		const source = (raw ?? {}) as Record<string, unknown>;
		return {
			tables: Array.isArray(source["tables"]) ? (source["tables"] as SandboxExecutionOutput["tables"]) : [],
			charts: Array.isArray(source["charts"]) ? (source["charts"] as SandboxExecutionOutput["charts"]) : [],
			narrative: Array.isArray(source["narrative"]) ? (source["narrative"] as SandboxExecutionOutput["narrative"]) : [],
			answer: typeof source["answer"] === "string" ? source["answer"] : undefined,
		};
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
