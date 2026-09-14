import { createHash, randomUUID } from "node:crypto";
import type { JsonObject } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type {
	ReportArtifact,
	ReportFormat,
	ReportGenerationRequest,
	ReportGenerationResult,
	ReportRendererSafetyContract,
	ReportServiceOptions,
	ReportTraceStage,
	ReportTraceStatus,
} from "./types.ts";
import { buildReportPreviewAction } from "./ui.ts";
import {
	expectedEvidenceIds,
	reportTraceDetails,
	validateRendererOutput,
	validateReportLimits,
	validateReportRequest,
} from "./validation.ts";

const SAFETY: ReportRendererSafetyContract = {
	formulasAllowed: false,
	externalLinksAllowed: false,
	remoteResourcesAllowed: false,
	executableContentAllowed: false,
	rawHtmlAllowed: false,
	toolOrPromptInstructionsInDataAreUntrusted: true,
	spreadsheetStringsAreLiteral: true,
};

class ReportRenderTimeoutError extends Error {
	constructor() {
		super("Report renderer timed out");
		this.name = "ReportRenderTimeoutError";
	}
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new ReportRenderTimeoutError());
		}, timeoutMs);
	});
	try {
		return await Promise.race([operation(controller.signal), timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

function safeFileBase(title: string): string {
	const cleaned = title
		.normalize("NFKC")
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
		.replace(/\s+/g, " ")
		.trim();
	return (!cleaned || cleaned === "." || cleaned === ".." ? "report" : cleaned).slice(0, 120);
}

function checksum(content: Uint8Array): string {
	return createHash("sha256").update(content).digest("hex");
}

export class ReportService {
	private readonly options: ReportServiceOptions;
	private readonly idFactory: () => string;
	private readonly now: () => Date;
	constructor(options: ReportServiceOptions) {
		this.options = { ...options, limits: validateReportLimits(options.limits) };
		this.idFactory = options.idFactory ?? (() => randomUUID());
		this.now = options.now ?? (() => new Date());
	}

	async generate(request: ReportGenerationRequest): Promise<ReportGenerationResult> {
		const reportId = this.idFactory();
		this.trace(request, reportId, "AUTHORIZE", "START");
		let authorized: boolean;
		try {
			authorized = await this.options.permissions.authorize({
				context: request.context,
				permission: "report.generate",
			});
		} catch (error) {
			this.trace(request, reportId, "AUTHORIZE", "ERROR", {
				message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
		if (!authorized) {
			this.trace(request, reportId, "AUTHORIZE", "BLOCKED");
			throw new IndustryAgentError("REPORT_ACCESS_DENIED", "Permission denied: report.generate");
		}
		this.trace(request, reportId, "AUTHORIZE", "OK");
		this.trace(request, reportId, "VALIDATE", "START");
		try {
			validateReportRequest(request, this.options.limits);
		} catch (error) {
			this.trace(request, reportId, "VALIDATE", "ERROR", {
				message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
		this.trace(request, reportId, "VALIDATE", "OK", {
			formats: request.formats,
			datasets: request.model.datasets.length,
			charts: request.model.charts.length,
			narrativeSections: request.model.narrative.length,
			evidence: request.model.evidence.length,
		});

		const artifacts: ReportArtifact[] = [];
		let totalBytes = 0;
		for (const format of request.formats) {
			const renderer = this.options.renderers.get(format);
			if (!renderer || renderer.format !== format || !renderer.version.trim()) {
				this.trace(
					request,
					reportId,
					"RENDER_START",
					"ERROR",
					{ message: `Renderer not found or invalid for format: ${format}` },
					format,
				);
				throw new IndustryAgentError(
					"REPORT_RENDERER_NOT_FOUND",
					`Renderer not found or invalid for format: ${format}`,
				);
			}
			const evidenceIds = expectedEvidenceIds(request.model, format);
			this.trace(
				request,
				reportId,
				"RENDER_START",
				"START",
				{ rendererVersion: renderer.version, evidenceCount: evidenceIds.length },
				format,
			);
			try {
				const raw = await withTimeout(
					(signal) =>
						renderer.render(
							{
								reportId,
								context: request.context,
								model: structuredClone(request.model),
								format,
								expectedEvidenceIds: evidenceIds,
								safety: SAFETY,
							},
							signal,
						),
					this.options.limits.renderTimeoutMs,
				);
				const output = validateRendererOutput(format, raw, this.options.limits.maxArtifactBytes, evidenceIds);
				totalBytes += output.content.byteLength;
				if (totalBytes > this.options.limits.maxTotalArtifactBytes)
					throw new IndustryAgentError(
						"REPORT_LIMIT_EXCEEDED",
						`Report exceeds max total artifact bytes ${this.options.limits.maxTotalArtifactBytes}`,
					);
				const artifactId = this.idFactory();
				const fileName = output.fileName ?? `${safeFileBase(request.model.title)}.${output.extension}`;
				const artifact: ReportArtifact = {
					artifactId,
					reportId,
					format,
					fileName,
					mimeType: output.mimeType,
					extension: output.extension,
					rendererVersion: renderer.version,
					checksumSha256: checksum(output.content),
					sizeBytes: output.content.byteLength,
					content: new Uint8Array(output.content),
					evidenceIds,
					createdAt: this.now().toISOString(),
				};
				artifacts.push(artifact);
				this.trace(
					request,
					reportId,
					"RENDER_END",
					"OK",
					{
						artifactId,
						rendererVersion: renderer.version,
						sizeBytes: artifact.sizeBytes,
						checksumSha256: artifact.checksumSha256,
					},
					format,
				);
			} catch (error) {
				this.trace(
					request,
					reportId,
					"RENDER_END",
					"ERROR",
					{ message: error instanceof Error ? error.message : String(error) },
					format,
				);
				if (error instanceof IndustryAgentError) throw error;
				if (error instanceof ReportRenderTimeoutError)
					throw new IndustryAgentError("REPORT_RENDER_FAILED", `${format} renderer timed out`, { cause: error });
				throw new IndustryAgentError("REPORT_RENDER_FAILED", `${format} renderer failed`, { cause: error });
			}
		}
		this.trace(request, reportId, "COMPLETE", "OK", { artifactCount: artifacts.length, totalBytes });
		return { reportId, artifacts, uiActions: [buildReportPreviewAction(reportId, artifacts)] };
	}

	private trace(
		request: ReportGenerationRequest,
		reportId: string,
		stage: ReportTraceStage,
		status: ReportTraceStatus,
		details?: JsonObject,
		format?: ReportFormat,
	): void {
		this.options.trace?.record({
			traceId: request.context.traceId,
			requestId: request.context.requestId,
			reportId,
			stage,
			status,
			...(format ? { format } : {}),
			...(details ? { details: reportTraceDetails(details) } : {}),
		});
	}
}
