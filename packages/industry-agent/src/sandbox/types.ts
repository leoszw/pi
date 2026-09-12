import type { JsonObject, RequestContext, ToolDefinition } from "../contracts/index.ts";
import type { MutationPrepareResult } from "../mutation/types.ts";
import type { ReportFormat, ReportGenerationResult, ReportCellValue, ReportColumnType, ReportChartType } from "../report/types.ts";

export interface SandboxScope {
	tenantId: string;
	companyId: string | null;
	projectId: string | null;
}

export type SandboxPermission = "sandbox.analyze" | "sandbox.schema.read" | "sandbox.data.read";

export interface SandboxPermissionService {
	authorize(input: { context: RequestContext; permission: SandboxPermission }): Promise<boolean>;
}

export interface SandboxUsage {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	costUsd: number;
}

export interface SandboxBudgetView {
	remainingTokens: number;
	remainingCostUsd: number;
	remainingDurationMs: number;
	maxRowsPerQuery: number;
	maxTotalRows: number;
}

export interface SandboxToolAction {
	toolName: string;
	toolVersion: string;
	args: JsonObject;
	purpose: string;
}

export interface SandboxToolCatalog {
	list(): readonly ToolDefinition[];
	get(name: string, version: string): ToolDefinition | undefined;
}

export type SandboxRouteDecision =
	| { kind: "USE_EXISTING_TOOLS"; actions: readonly SandboxToolAction[]; usage: SandboxUsage }
	| { kind: "SANDBOX_REQUIRED"; reason: string; usage: SandboxUsage }
	| { kind: "ASK_USER"; question: string; usage: SandboxUsage }
	| { kind: "FAIL"; reason: string; usage: SandboxUsage };

export interface SandboxSchemaColumn {
	name: string;
	dataType: string;
	nullable: boolean;
	sandboxReadable: true;
	entityType?: string;
}

export interface SandboxSchemaTable {
	tableName: string;
	description: string;
	sourceVersion: string;
	readOnly: true;
	columns: readonly SandboxSchemaColumn[];
	scopeColumns: {
		tenantId?: string;
		companyId?: string;
		projectId?: string;
	};
}

export interface SandboxSchemaSnapshot {
	snapshotId: string;
	version: string;
	scope: SandboxScope;
	tables: readonly SandboxSchemaTable[];
}

export interface SandboxSchemaDiscovery {
	discover(input: { context: RequestContext; goal: string }, signal: AbortSignal): Promise<SandboxSchemaSnapshot>;
}

export interface SandboxSqlQuery {
	queryId: string;
	sql: string;
	referencedTables: readonly string[];
}

export interface SandboxProgram {
	programId: string;
	queries: readonly SandboxSqlQuery[];
	python: string;
	explanation: string;
}

export interface SandboxPlanner {
	version: string;
	route(
		input: { goal: string; context: RequestContext; availableTools: readonly ToolDefinition[]; budget: SandboxBudgetView },
		signal: AbortSignal,
	): Promise<SandboxRouteDecision>;
	generate(
		input: { goal: string; context: RequestContext; schema: SandboxSchemaSnapshot; budget: SandboxBudgetView },
		signal: AbortSignal,
	): Promise<{ program: SandboxProgram; usage: SandboxUsage }>;
}

export interface SandboxBrokerEvidence {
	evidenceId: string;
	sourceId: string;
	sourceVersion: string;
	updatedAt?: string;
}

export interface SandboxEntityRef {
	entityType: string;
	entityId: string;
	evidenceId: string;
}

export interface SandboxBrokerColumn {
	key: string;
	label: string;
	type: ReportColumnType;
}

export type SandboxBrokerRow = Readonly<Record<string, ReportCellValue>>;

export interface SandboxBrokerAttestation {
	readOnlyEnforced: true;
	serverScopeEnforced: true;
	sqlPolicyRevalidated: true;
	schemaAllowlistEnforced: true;
	statementTimeoutEnforced: true;
	queryCostGuardEnforced: true;
	credentialsExposedToSandbox: false;
	policyVersion: string;
}

export interface SandboxBrokerResult {
	queryId: string;
	schemaSnapshotId: string;
	scope: SandboxScope;
	columns: readonly SandboxBrokerColumn[];
	rows: readonly SandboxBrokerRow[];
	evidence: readonly SandboxBrokerEvidence[];
	entityRefs: readonly SandboxEntityRef[];
	attestation: SandboxBrokerAttestation;
}

export interface SandboxDataAccessBroker {
	executeReadOnly(input: {
		context: RequestContext;
		schema: SandboxSchemaSnapshot;
		query: SandboxSqlQuery;
		maxRows: number;
		timeoutMs: number;
	}, signal: AbortSignal): Promise<SandboxBrokerResult>;
}

export interface SandboxReadableDataset {
	queryId: string;
	columns: readonly SandboxBrokerColumn[];
	rows: readonly SandboxBrokerRow[];
}

export interface SandboxReadCapability {
	read(queryId: string): Promise<SandboxReadableDataset>;
}

export interface SandboxRuntimeSafetyContract {
	networkDisabled: true;
	filesystemDisabled: true;
	processSpawnDisabled: true;
	environmentSecretsExposed: false;
	importsDisabled: true;
	dynamicCodeDisabled: true;
	dataAccessMode: "QUERY_ID_ONLY";
	abortTerminatesExecution: true;
}

export interface SandboxExecutorInput {
	runId: string;
	programId: string;
	python: string;
	permittedQueryIds: readonly string[];
	maxOutputRows: number;
	maxOutputChars: number;
	safety: SandboxRuntimeSafetyContract;
}

export interface SandboxRuntimeAttestation extends SandboxRuntimeSafetyContract {
	runtimeVersion: string;
	executedPythonSha256: string;
	cpuTimeMs: number;
	memoryPeakBytes: number;
}

export interface SandboxOutputTable {
	tableId: string;
	name: string;
	columns: readonly SandboxBrokerColumn[];
	rows: readonly SandboxBrokerRow[];
	sourceQueryIds: readonly string[];
}

export interface SandboxOutputChart {
	chartId: string;
	title: string;
	type: ReportChartType;
	tableId: string;
	categoryColumn: string;
	valueColumns: readonly string[];
	sourceQueryIds: readonly string[];
}

export interface SandboxOutputNarrative {
	sectionId: string;
	heading: string;
	body: string;
	sourceQueryIds: readonly string[];
}

export interface SandboxExecutionOutput {
	tables: readonly SandboxOutputTable[];
	charts: readonly SandboxOutputChart[];
	narrative: readonly SandboxOutputNarrative[];
	answer?: string;
}

export interface SandboxExecutorResult {
	output: SandboxExecutionOutput;
	attestation: SandboxRuntimeAttestation;
}

export interface SandboxExecutor {
	execute(
		input: SandboxExecutorInput,
		dataAccess: SandboxReadCapability,
		signal: AbortSignal,
	): Promise<SandboxExecutorResult>;
}

export interface SandboxMutationRecommendation {
	operation: "CREATE" | "UPDATE" | "DELETE";
	entityType: string;
	targetEntityIds: readonly string[];
	values: JsonObject;
	reason?: string;
	evidenceQueryIds: readonly string[];
}

export type SandboxVerificationDecision =
	| { kind: "ACCEPT"; summary: string; usage: SandboxUsage }
	| { kind: "ASK_USER"; question: string; usage: SandboxUsage }
	| { kind: "MUTATION_REQUIRED"; summary: string; recommendation: SandboxMutationRecommendation; usage: SandboxUsage }
	| { kind: "FAIL"; reason: string; usage: SandboxUsage };

export interface SandboxVerifier {
	version: string;
	verify(input: {
		goal: string;
		context: RequestContext;
		program: SandboxProgram;
		output: SandboxExecutionOutput;
		readQueryIds: readonly string[];
		budget: SandboxBudgetView;
	}, signal: AbortSignal): Promise<SandboxVerificationDecision>;
}

export interface SandboxMutationPreparer {
	prepare(input: { context: RequestContext; recommendation: SandboxMutationRecommendation }): Promise<MutationPrepareResult>;
}

export interface SandboxReportBuilderInput {
	context: RequestContext;
	goal: string;
	reportTitle: string;
	formats: readonly ReportFormat[];
	program: SandboxProgram;
	output: SandboxExecutionOutput;
	brokerResults: readonly SandboxBrokerResult[];
	runtimeVersion: string;
	verificationSummary: string;
}

export interface SandboxReportBuilder {
	build(input: SandboxReportBuilderInput): Promise<ReportGenerationResult>;
}

export interface SandboxLimits {
	maxToolHandoffActions: number;
	maxQueries: number;
	maxSqlChars: number;
	maxPythonChars: number;
	maxBrokerCalls: number;
	maxRowsPerQuery: number;
	maxTotalBrokerRows: number;
	maxCellChars: number;
	maxBrokerResultChars: number;
	maxTotalBrokerChars: number;
	maxBrokerExecutionMs: number;
	maxOutputTables: number;
	maxOutputRows: number;
	maxOutputChars: number;
	maxTotalTokens: number;
	maxCostUsd: number;
	maxDurationMs: number;
	maxOperationMs: number;
	maxSandboxCpuMs: number;
	maxSandboxMemoryBytes: number;
}

export type SandboxTraceStage =
	| "AUTHORIZE"
	| "ROUTE"
	| "SCHEMA_DISCOVERY"
	| "GENERATE"
	| "STATIC_VALIDATE"
	| "SANDBOX_START"
	| "BROKER_READ"
	| "SANDBOX_END"
	| "VERIFY"
	| "MUTATION_PREPARE"
	| "REPORT_BUILD"
	| "COMPLETE";

export type SandboxTraceStatus = "START" | "OK" | "ERROR" | "BLOCKED";

export interface SandboxTraceEvent {
	traceId: string;
	requestId: string;
	runId: string;
	stage: SandboxTraceStage;
	status: SandboxTraceStatus;
	details?: JsonObject;
}

export interface SandboxTraceSink {
	record(event: SandboxTraceEvent): void;
}

export interface SandboxGoal {
	goal: string;
	context: RequestContext;
	requestedReportFormats: readonly ReportFormat[];
	reportTitle?: string;
	metadata?: JsonObject;
}

export type SandboxRunResult =
	| {
		status: "TOOLS_SUFFICIENT";
		runId: string;
		toolActions: readonly SandboxToolAction[];
		usage: SandboxUsage;
		usageAccountingComplete: true;
	}
	| {
		status: "USER_INPUT_REQUIRED";
		runId: string;
		question: string;
		usage: SandboxUsage;
		usageAccountingComplete: true;
	}
	| {
		status: "FAILED";
		runId: string;
		reason: string;
		usage: SandboxUsage;
		usageAccountingComplete: true;
	}
	| {
		status: "REPORT_READY";
		runId: string;
		summary: string;
		report: ReportGenerationResult;
		readQueryIds: readonly string[];
		runtimeVersion: string;
		usage: SandboxUsage;
		usageAccountingComplete: true;
	}
	| {
		status: "MUTATION_CONFIRMATION_REQUIRED";
		runId: string;
		summary: string;
		mutationPrepare: MutationPrepareResult;
		readQueryIds: readonly string[];
		runtimeVersion: string;
		usage: SandboxUsage;
		usageAccountingComplete: true;
	};

export interface SandboxServiceOptions {
	permissions: SandboxPermissionService;
	tools: SandboxToolCatalog;
	planner: SandboxPlanner;
	schemaDiscovery: SandboxSchemaDiscovery;
	broker: SandboxDataAccessBroker;
	executor: SandboxExecutor;
	verifier: SandboxVerifier;
	mutation: SandboxMutationPreparer;
	reportBuilder: SandboxReportBuilder;
	limits: SandboxLimits;
	trace?: SandboxTraceSink;
	idFactory?: () => string;
	nowMs?: () => number;
}
