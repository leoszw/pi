import { randomUUID } from "node:crypto";
import type { JsonObject } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type {
	SandboxBrokerResult,
	SandboxGoal,
	SandboxLimits,
	SandboxReadCapability,
	SandboxRunResult,
	SandboxServiceOptions,
	SandboxTraceStage,
	SandboxTraceStatus,
	SandboxUsage,
} from "./types.ts";
import { addSandboxUsage, sandboxBudget, validateSandboxUsage, ZERO_SANDBOX_USAGE } from "./usage.ts";
import {
	sandboxTraceDetails,
	validateBrokerResult,
	validateGeneratedProgram,
	validateMutationRecommendation,
	validateSandboxProgram,
	validateRouteDecision,
	validateRuntimeAttestation,
	validateSandboxLimits,
	validateSchemaSnapshot,
	validateExecutionOutput,
	validateVerificationDecision,
} from "./validation.ts";

const RUNTIME_SAFETY = {
	networkDisabled: true,
	filesystemDisabled: true,
	processSpawnDisabled: true,
	environmentSecretsExposed: false,
	importsDisabled: true,
	dynamicCodeDisabled: true,
	dataAccessMode: "QUERY_ID_ONLY",
	abortTerminatesExecution: true,
} as const;

const REPORT_FORMATS = new Set(["EXCEL", "PDF", "CHART", "NARRATIVE"]);

class SandboxOperationTimeoutError extends Error {
	constructor() { super("Sandbox operation timed out"); this.name = "SandboxOperationTimeoutError"; }
}

async function withDeadline<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	parentSignal?: AbortSignal,
): Promise<T> {
	if (timeoutMs <= 0) throw new SandboxOperationTimeoutError();
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onParentAbort: (() => void) | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => { controller.abort(); reject(new SandboxOperationTimeoutError()); }, timeoutMs);
	});
	const parentAbort = parentSignal
		? new Promise<never>((_, reject) => {
			onParentAbort = () => { controller.abort(); reject(new SandboxOperationTimeoutError()); };
			if (parentSignal.aborted) onParentAbort();
			else parentSignal.addEventListener("abort", onParentAbort, { once: true });
		})
		: new Promise<never>(() => {});
	try { return await Promise.race([operation(controller.signal), timeout, parentAbort]); }
	finally {
		if (timer !== undefined) clearTimeout(timer);
		if (parentSignal && onParentAbort) parentSignal.removeEventListener("abort", onParentAbort);
	}
}

function nonEmpty(value: string, label: string, max = 5000): string {
	const clean = value.trim();
	if (!clean) throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", `${label} must not be empty`);
	if (clean.length > max) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", `${label} exceeds ${max} characters`);
	return clean;
}

export class SandboxAnalysisService {
	private readonly options: SandboxServiceOptions;
	private readonly limits: SandboxLimits;
	private readonly idFactory: () => string;
	private readonly nowMs: () => number;

	constructor(options: SandboxServiceOptions) {
		this.options = options;
		this.limits = validateSandboxLimits(options.limits);
		this.idFactory = options.idFactory ?? (() => randomUUID());
		this.nowMs = options.nowMs ?? (() => Date.now());
		if (!options.planner.version.trim() || !options.verifier.version.trim()) throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "Planner and verifier versions must not be empty");
	}

	async run(input: SandboxGoal): Promise<SandboxRunResult> {
		const runId = this.idFactory();
		const startedAt = this.nowMs();
		const goal = nonEmpty(input.goal, "goal", 10_000);
		const reportTitle = input.reportTitle === undefined ? "Analysis Report" : nonEmpty(input.reportTitle, "reportTitle", 500);
		if (!input.requestedReportFormats.length || input.requestedReportFormats.length > 4) throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "requestedReportFormats must contain between 1 and 4 formats");
		if (new Set(input.requestedReportFormats).size !== input.requestedReportFormats.length) throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "requestedReportFormats must be unique");
		for (const format of input.requestedReportFormats) if (!REPORT_FORMATS.has(format)) throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", `Unsupported report format: ${String(format)}`);

		let usage: SandboxUsage = { ...ZERO_SANDBOX_USAGE };
		this.trace(input, runId, "AUTHORIZE", "START", { permission: "sandbox.analyze" });
		await this.requirePermission(input, "sandbox.analyze", runId);
		this.trace(input, runId, "AUTHORIZE", "OK", { permission: "sandbox.analyze" });

		const availableTools = this.options.tools.list();
		this.assertBeforeModel(startedAt, usage);
		this.trace(input, runId, "ROUTE", "START", { availableToolCount: availableTools.length, plannerVersion: this.options.planner.version });
		let route;
		try {
			const raw = await withDeadline(
				(signal) => this.options.planner.route({ goal, context: input.context, availableTools, budget: sandboxBudget(this.limits, usage, startedAt, this.nowMs()) }, signal),
				this.operationTimeout(startedAt),
			);
			const routeUsage = validateSandboxUsage(typeof raw === "object" && raw !== null ? (raw as Readonly<Record<string, unknown>>)["usage"] : undefined);
			usage = addSandboxUsage(usage, routeUsage);
			route = validateRouteDecision(raw, availableTools, input.context, this.limits.maxToolHandoffActions);
		} catch (error) {
			this.trace(input, runId, "ROUTE", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			if (error instanceof IndustryAgentError) throw error;
			throw new IndustryAgentError("SANDBOX_USAGE_ACCOUNTING_INCOMPLETE", "Sandbox planner route failed before usage could be trusted", { cause: error });
		}
		this.assertAfterModel(startedAt, usage);
		this.trace(input, runId, "ROUTE", "OK", { decision: route.kind, totalTokens: usage.totalTokens, costUsd: usage.costUsd });

		if (route.kind === "USE_EXISTING_TOOLS") {
			this.trace(input, runId, "COMPLETE", "OK", { status: "TOOLS_SUFFICIENT", actionCount: route.actions.length });
			return { status: "TOOLS_SUFFICIENT", runId, toolActions: route.actions, usage, usageAccountingComplete: true };
		}
		if (route.kind === "ASK_USER") {
			this.trace(input, runId, "COMPLETE", "OK", { status: "USER_INPUT_REQUIRED" });
			return { status: "USER_INPUT_REQUIRED", runId, question: route.question, usage, usageAccountingComplete: true };
		}
		if (route.kind === "FAIL") {
			this.trace(input, runId, "COMPLETE", "OK", { status: "FAILED" });
			return { status: "FAILED", runId, reason: route.reason, usage, usageAccountingComplete: true };
		}

		this.trace(input, runId, "AUTHORIZE", "START", { permission: "sandbox.schema.read" });
		await this.requirePermission(input, "sandbox.schema.read", runId);
		this.trace(input, runId, "AUTHORIZE", "OK", { permission: "sandbox.schema.read" });

		this.trace(input, runId, "SCHEMA_DISCOVERY", "START");
		let schema;
		try {
			schema = validateSchemaSnapshot(input.context, await withDeadline(
				(signal) => this.options.schemaDiscovery.discover({ context: input.context, goal }, signal),
				this.operationTimeout(startedAt),
			));
		} catch (error) {
			this.trace(input, runId, "SCHEMA_DISCOVERY", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			if (error instanceof IndustryAgentError) throw error;
			throw new IndustryAgentError("SANDBOX_SCHEMA_INVALID", "Schema discovery failed", { cause: error });
		}
		this.trace(input, runId, "SCHEMA_DISCOVERY", "OK", { snapshotId: schema.snapshotId, schemaVersion: schema.version, tableCount: schema.tables.length });

		this.assertBeforeModel(startedAt, usage);
		this.trace(input, runId, "GENERATE", "START", { plannerVersion: this.options.planner.version, snapshotId: schema.snapshotId });
		let generatedProgram;
		try {
			const raw = await withDeadline(
				(signal) => this.options.planner.generate({ goal, context: input.context, schema, budget: sandboxBudget(this.limits, usage, startedAt, this.nowMs()) }, signal),
				this.operationTimeout(startedAt),
			);
			const generated = validateGeneratedProgram(raw);
			usage = addSandboxUsage(usage, generated.usage);
			generatedProgram = generated.program;
		} catch (error) {
			this.trace(input, runId, "GENERATE", "ERROR", { message: error instanceof Error ? error.message : String(error), totalTokens: usage.totalTokens, costUsd: usage.costUsd });
			if (error instanceof IndustryAgentError) throw error;
			throw new IndustryAgentError("SANDBOX_USAGE_ACCOUNTING_INCOMPLETE", "Sandbox program generation failed before usage could be trusted", { cause: error });
		}
		this.assertAfterModel(startedAt, usage);
		this.trace(input, runId, "GENERATE", "OK", { programId: generatedProgram.programId, queryCount: generatedProgram.queries.length, totalTokens: usage.totalTokens, costUsd: usage.costUsd });
		this.trace(input, runId, "STATIC_VALIDATE", "START", { programId: generatedProgram.programId });
		let program;
		try {
			program = validateSandboxProgram(generatedProgram, schema, this.limits);
		} catch (error) {
			this.trace(input, runId, "STATIC_VALIDATE", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			throw error;
		}
		this.trace(input, runId, "STATIC_VALIDATE", "OK", { programId: program.programId, queryCount: program.queries.length });

		this.trace(input, runId, "AUTHORIZE", "START", { permission: "sandbox.data.read" });
		await this.requirePermission(input, "sandbox.data.read", runId);
		this.trace(input, runId, "AUTHORIZE", "OK", { permission: "sandbox.data.read" });

		const queryMap = new Map(program.queries.map((query) => [query.queryId, query] as const));
		const brokerResults = new Map<string, SandboxBrokerResult>();
		let brokerCalls = 0;
		let brokerRows = 0;
		let brokerChars = 0;
		let sandboxSignal: AbortSignal | undefined;
		const dataAccess: SandboxReadCapability = {
			read: async (queryId: string) => {
				const query = queryMap.get(queryId);
				if (!query) throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Sandbox requested unknown queryId: ${queryId}`);
				if (brokerResults.has(queryId)) throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Sandbox attempted to read query more than once: ${queryId}`);
				if (brokerCalls >= this.limits.maxBrokerCalls) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", `Sandbox exceeded max broker calls ${this.limits.maxBrokerCalls}`);
				await this.requirePermission(input, "sandbox.data.read", runId);
				brokerCalls += 1;
				this.trace(input, runId, "BROKER_READ", "START", { queryId, brokerCall: brokerCalls });
				try {
					const brokerTimeout = Math.min(this.limits.maxBrokerExecutionMs, this.operationTimeout(startedAt));
					const raw = await withDeadline(
						(signal) => this.options.broker.executeReadOnly({ context: input.context, schema, query, maxRows: this.limits.maxRowsPerQuery, timeoutMs: brokerTimeout }, signal),
						brokerTimeout,
						sandboxSignal,
					);
					const result = validateBrokerResult(raw, input.context, schema, queryId, this.limits);
					brokerRows += result.rows.length;
					if (brokerRows > this.limits.maxTotalBrokerRows) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", `Sandbox exceeded max total broker rows ${this.limits.maxTotalBrokerRows}`);
					brokerChars += JSON.stringify({ columns: result.columns, rows: result.rows }).length;
					if (brokerChars > this.limits.maxTotalBrokerChars) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", `Sandbox exceeded max total broker characters ${this.limits.maxTotalBrokerChars}`);
					brokerResults.set(queryId, result);
					this.trace(input, runId, "BROKER_READ", "OK", { queryId, rowCount: result.rows.length, evidenceCount: result.evidence.length });
					return { queryId, columns: structuredClone(result.columns), rows: structuredClone(result.rows) };
				} catch (error) {
					this.trace(input, runId, "BROKER_READ", "ERROR", { queryId, message: error instanceof Error ? error.message : String(error) });
					if (error instanceof IndustryAgentError) throw error;
					throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Read-only broker failed for ${queryId}`, { cause: error });
				}
			},
		};

		this.trace(input, runId, "SANDBOX_START", "START", { programId: program.programId, permittedQueryCount: program.queries.length });
		let executed;
		try {
			executed = await withDeadline(
				async (signal) => {
					sandboxSignal = signal;
					return this.options.executor.execute({
						runId,
						programId: program.programId,
						python: program.python,
						permittedQueryIds: program.queries.map((query) => query.queryId),
						maxOutputRows: this.limits.maxOutputRows,
						maxOutputChars: this.limits.maxOutputChars,
						safety: RUNTIME_SAFETY,
					}, dataAccess, signal);
				},
				this.operationTimeout(startedAt),
			);
		} catch (error) {
			this.trace(input, runId, "SANDBOX_END", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			if (error instanceof IndustryAgentError) throw error;
			if (error instanceof SandboxOperationTimeoutError) throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Sandbox execution timed out", { cause: error });
			throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Sandbox execution failed", { cause: error });
		} finally {
			sandboxSignal = undefined;
		}
		const attestation = validateRuntimeAttestation(executed.attestation, program.python, this.limits);
		const readQueryIds = [...brokerResults.keys()];
		const output = validateExecutionOutput(executed.output, readQueryIds, this.limits);
		this.trace(input, runId, "SANDBOX_END", "OK", {
			runtimeVersion: attestation.runtimeVersion,
			readQueryCount: readQueryIds.length,
			brokerRows,
			brokerChars,
			outputTableCount: output.tables.length,
			cpuTimeMs: attestation.cpuTimeMs,
			memoryPeakBytes: attestation.memoryPeakBytes,
		});

		this.assertBeforeModel(startedAt, usage);
		this.trace(input, runId, "VERIFY", "START", { verifierVersion: this.options.verifier.version });
		let verification;
		try {
			const raw = await withDeadline(
				(signal) => this.options.verifier.verify({
					goal,
					context: input.context,
					program,
					output,
					readQueryIds,
					budget: sandboxBudget(this.limits, usage, startedAt, this.nowMs()),
				}, signal),
				this.operationTimeout(startedAt),
			);
			const verifierUsage = validateSandboxUsage(typeof raw === "object" && raw !== null ? (raw as Readonly<Record<string, unknown>>)["usage"] : undefined);
			usage = addSandboxUsage(usage, verifierUsage);
			verification = validateVerificationDecision(raw);
		} catch (error) {
			this.trace(input, runId, "VERIFY", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			if (error instanceof IndustryAgentError) throw error;
			throw new IndustryAgentError("SANDBOX_USAGE_ACCOUNTING_INCOMPLETE", "Sandbox verification failed before usage could be trusted", { cause: error });
		}
		this.assertAfterModel(startedAt, usage);
		this.trace(input, runId, "VERIFY", "OK", { decision: verification.kind, totalTokens: usage.totalTokens, costUsd: usage.costUsd });

		if (verification.kind === "ASK_USER") {
			this.trace(input, runId, "COMPLETE", "OK", { status: "USER_INPUT_REQUIRED" });
			return { status: "USER_INPUT_REQUIRED", runId, question: verification.question, usage, usageAccountingComplete: true };
		}
		if (verification.kind === "FAIL") {
			this.trace(input, runId, "COMPLETE", "OK", { status: "FAILED" });
			return { status: "FAILED", runId, reason: verification.reason, usage, usageAccountingComplete: true };
		}
		const results = [...brokerResults.values()];
		if (verification.kind === "MUTATION_REQUIRED") {
			const recommendation = validateMutationRecommendation(verification.recommendation, readQueryIds, results);
			this.trace(input, runId, "MUTATION_PREPARE", "START", { operation: recommendation.operation, entityType: recommendation.entityType, targetCount: recommendation.targetEntityIds.length });
			const mutationPrepare = await this.options.mutation.prepare({ context: input.context, recommendation });
			this.trace(input, runId, "MUTATION_PREPARE", "OK", { operationId: mutationPrepare.proposal.operationId, digest: mutationPrepare.proposal.digest });
			this.trace(input, runId, "COMPLETE", "OK", { status: "MUTATION_CONFIRMATION_REQUIRED" });
			return {
				status: "MUTATION_CONFIRMATION_REQUIRED",
				runId,
				summary: verification.summary,
				mutationPrepare,
				readQueryIds,
				runtimeVersion: attestation.runtimeVersion,
				usage,
				usageAccountingComplete: true,
			};
		}

		this.trace(input, runId, "REPORT_BUILD", "START", { formatCount: input.requestedReportFormats.length });
		let report;
		try {
			report = await this.options.reportBuilder.build({
				context: input.context,
				goal,
				reportTitle,
				formats: input.requestedReportFormats,
				program,
				output,
				brokerResults: results,
				runtimeVersion: attestation.runtimeVersion,
				verificationSummary: verification.summary,
			});
		} catch (error) {
			this.trace(input, runId, "REPORT_BUILD", "ERROR", { message: error instanceof Error ? error.message : String(error) });
			throw error;
		}
		this.trace(input, runId, "REPORT_BUILD", "OK", { reportId: report.reportId, artifactCount: report.artifacts.length });
		this.trace(input, runId, "COMPLETE", "OK", { status: "REPORT_READY", reportId: report.reportId });
		return {
			status: "REPORT_READY",
			runId,
			summary: verification.summary,
			report,
			readQueryIds,
			runtimeVersion: attestation.runtimeVersion,
			usage,
			usageAccountingComplete: true,
		};
	}

	private async requirePermission(input: SandboxGoal, permission: Parameters<SandboxServiceOptions["permissions"]["authorize"]>[0]["permission"], runId: string): Promise<void> {
		let allowed: boolean;
		try { allowed = await this.options.permissions.authorize({ context: input.context, permission }); }
		catch (error) {
			this.trace(input, runId, "AUTHORIZE", "ERROR", { permission, message: error instanceof Error ? error.message : String(error) });
			throw error;
		}
		if (!allowed) {
			this.trace(input, runId, "AUTHORIZE", "BLOCKED", { permission });
			throw new IndustryAgentError("SANDBOX_ACCESS_DENIED", `Permission denied: ${permission}`);
		}
	}

	private assertBeforeModel(startedAt: number, usage: SandboxUsage): void {
		if (usage.totalTokens >= this.limits.maxTotalTokens) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox token budget exhausted");
		if (usage.costUsd >= this.limits.maxCostUsd) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox cost budget exhausted");
		if (this.nowMs() - startedAt >= this.limits.maxDurationMs) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox total duration exhausted");
	}

	private assertAfterModel(startedAt: number, usage: SandboxUsage): void {
		if (usage.totalTokens > this.limits.maxTotalTokens) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox token budget exceeded");
		if (usage.costUsd > this.limits.maxCostUsd) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox cost budget exceeded");
		if (this.nowMs() - startedAt > this.limits.maxDurationMs) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox total duration exceeded");
	}

	private operationTimeout(startedAt: number): number {
		const remaining = this.limits.maxDurationMs - Math.max(0, this.nowMs() - startedAt);
		return Math.max(0, Math.min(this.limits.maxOperationMs, remaining));
	}

	private trace(input: SandboxGoal, runId: string, stage: SandboxTraceStage, status: SandboxTraceStatus, details?: JsonObject): void {
		this.options.trace?.record({
			traceId: input.context.traceId,
			requestId: input.context.requestId,
			runId,
			stage,
			status,
			...(details ? { details: sandboxTraceDetails(details) } : {}),
		});
	}
}
