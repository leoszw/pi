import { createHash } from "node:crypto";
import type { JsonObject, RequestContext, ToolDefinition } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import { validateSandboxPython } from "./python-validator.ts";
import { validateReadOnlySqlQuery } from "./sql-validator.ts";
import type {
	SandboxBrokerResult,
	SandboxExecutionOutput,
	SandboxLimits,
	SandboxMutationRecommendation,
	SandboxProgram,
	SandboxRouteDecision,
	SandboxRuntimeAttestation,
	SandboxSchemaSnapshot,
	SandboxScope,
	SandboxToolAction,
	SandboxUsage,
	SandboxVerificationDecision,
} from "./types.ts";
import { validateSandboxUsage } from "./usage.ts";

const COLUMN_TYPES = new Set(["STRING", "NUMBER", "BOOLEAN", "DATE", "DATETIME"]);
const CHART_TYPES = new Set(["BAR", "LINE", "PIE"]);

function record(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string, max = 1000): string {
	if (typeof value !== "string" || !value.trim())
		throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", `${label} must be a non-empty string`);
	const clean = value.trim();
	if (clean.length > max) throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", `${label} exceeds ${max} characters`);
	return clean;
}

function scopeFromContext(context: RequestContext): SandboxScope {
	return { tenantId: context.tenantId, companyId: context.companyId ?? null, projectId: context.projectId ?? null };
}

function sameScope(left: SandboxScope, right: SandboxScope): boolean {
	return left.tenantId === right.tenantId && left.companyId === right.companyId && left.projectId === right.projectId;
}

export function validateSandboxLimits(limits: SandboxLimits): SandboxLimits {
	const integerFields: readonly (keyof Omit<SandboxLimits, "maxCostUsd">)[] = [
		"maxToolHandoffActions",
		"maxQueries",
		"maxSqlChars",
		"maxPythonChars",
		"maxBrokerCalls",
		"maxRowsPerQuery",
		"maxTotalBrokerRows",
		"maxCellChars",
		"maxBrokerResultChars",
		"maxTotalBrokerChars",
		"maxBrokerExecutionMs",
		"maxOutputTables",
		"maxOutputRows",
		"maxOutputChars",
		"maxTotalTokens",
		"maxDurationMs",
		"maxOperationMs",
		"maxSandboxCpuMs",
		"maxSandboxMemoryBytes",
	];
	for (const field of integerFields) {
		const value = limits[field];
		if (!Number.isInteger(value) || value <= 0)
			throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", `${field} must be a positive integer`);
	}
	if (!Number.isFinite(limits.maxCostUsd) || limits.maxCostUsd <= 0)
		throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "maxCostUsd must be positive");
	if (limits.maxBrokerCalls < limits.maxQueries)
		throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "maxBrokerCalls must be >= maxQueries");
	if (limits.maxTotalBrokerRows < limits.maxRowsPerQuery)
		throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "maxTotalBrokerRows must be >= maxRowsPerQuery");
	if (limits.maxTotalBrokerChars < limits.maxBrokerResultChars)
		throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "maxTotalBrokerChars must be >= maxBrokerResultChars");
	if (limits.maxBrokerExecutionMs > limits.maxOperationMs)
		throw new IndustryAgentError("SANDBOX_INVALID_REQUEST", "maxBrokerExecutionMs must be <= maxOperationMs");
	return limits;
}

export function validateSchemaSnapshot(context: RequestContext, value: SandboxSchemaSnapshot): SandboxSchemaSnapshot {
	const snapshotId = text(value.snapshotId, "schema snapshotId", 256);
	const version = text(value.version, "schema version", 256);
	if (!sameScope(scopeFromContext(context), value.scope))
		throw new IndustryAgentError(
			"SANDBOX_SCHEMA_INVALID",
			"Schema snapshot escaped request tenant/company/project scope",
		);
	if (!value.tables.length)
		throw new IndustryAgentError(
			"SANDBOX_SCHEMA_INVALID",
			"Schema snapshot must contain at least one allowlisted table",
		);
	const tableNames = new Set<string>();
	for (const table of value.tables) {
		const name = text(table.tableName, "schema tableName", 256).toLowerCase();
		if (tableNames.has(name))
			throw new IndustryAgentError("SANDBOX_SCHEMA_INVALID", `Duplicate schema table: ${table.tableName}`);
		tableNames.add(name);
		if (table.readOnly !== true)
			throw new IndustryAgentError("SANDBOX_SCHEMA_INVALID", `Schema table is not read-only: ${table.tableName}`);
		text(table.description, `schema table ${table.tableName} description`, 2000);
		text(table.sourceVersion, `schema table ${table.tableName} sourceVersion`, 256);
		if (!table.columns.length)
			throw new IndustryAgentError(
				"SANDBOX_SCHEMA_INVALID",
				`Schema table has no readable columns: ${table.tableName}`,
			);
		const columns = new Set<string>();
		for (const column of table.columns) {
			const columnName = text(column.name, `schema column ${table.tableName}`, 128).toLowerCase();
			if (columns.has(columnName))
				throw new IndustryAgentError(
					"SANDBOX_SCHEMA_INVALID",
					`Duplicate schema column: ${table.tableName}.${column.name}`,
				);
			columns.add(columnName);
			text(column.dataType, `schema column ${table.tableName}.${column.name} dataType`, 128);
			if (column.sandboxReadable !== true)
				throw new IndustryAgentError(
					"SANDBOX_SCHEMA_INVALID",
					`Schema exposed a non-readable column: ${table.tableName}.${column.name}`,
				);
			if (column.entityType !== undefined)
				text(column.entityType, `schema column ${table.tableName}.${column.name} entityType`, 128);
		}
		for (const [scopeName, columnName] of Object.entries(table.scopeColumns)) {
			if (!columns.has(columnName.toLowerCase()))
				throw new IndustryAgentError(
					"SANDBOX_SCHEMA_INVALID",
					`Scope column ${scopeName} is not exposed by ${table.tableName}: ${columnName}`,
				);
		}
	}
	return { ...value, snapshotId, version };
}

export function validateSandboxProgram(
	program: SandboxProgram,
	schema: SandboxSchemaSnapshot,
	limits: SandboxLimits,
): SandboxProgram {
	const programId = text(program.programId, "programId", 256);
	text(program.explanation, "program explanation", 5000);
	if (!program.queries.length || program.queries.length > limits.maxQueries)
		throw new IndustryAgentError(
			"SANDBOX_LIMIT_EXCEEDED",
			`Sandbox query count must be between 1 and ${limits.maxQueries}`,
		);
	const queryIds = new Set<string>();
	const queries = program.queries.map((query) => {
		const queryId = text(query.queryId, "queryId", 128);
		if (queryIds.has(queryId))
			throw new IndustryAgentError("SANDBOX_STATIC_VALIDATION_FAILED", `Duplicate queryId: ${queryId}`);
		queryIds.add(queryId);
		const validated = validateReadOnlySqlQuery({ ...query, queryId }, schema, limits);
		return validated.query;
	});
	const normalized: SandboxProgram = { ...program, programId, queries };
	validateSandboxPython(normalized, limits);
	return normalized;
}

function validateToolAction(
	action: SandboxToolAction,
	tools: ReadonlyMap<string, ToolDefinition>,
	context: RequestContext,
): SandboxToolAction {
	const toolName = text(action.toolName, "toolName", 128);
	const toolVersion = text(action.toolVersion, "toolVersion", 64);
	const purpose = text(action.purpose, "tool purpose", 1000);
	const definition = tools.get(`${toolName}@${toolVersion}`);
	if (!definition)
		throw new IndustryAgentError("SANDBOX_TOOL_HANDOFF_INVALID", `Unknown existing Tool: ${toolName}@${toolVersion}`);
	if (
		definition.requiresConfirmation ||
		definition.riskLevel === "CRITICAL" ||
		["CREATE", "UPDATE", "DELETE"].includes(definition.action)
	) {
		throw new IndustryAgentError(
			"SANDBOX_TOOL_HANDOFF_INVALID",
			`Tool handoff is not read-only/safe: ${toolName}@${toolVersion}`,
		);
	}
	const args = { ...action.args } as Record<string, unknown>;
	const scopeValues: Readonly<Record<string, string | undefined>> = {
		userId: context.userId,
		tenantId: context.tenantId,
		companyId: context.companyId,
		projectId: context.projectId,
	};
	for (const [field, expected] of Object.entries(scopeValues)) {
		if (!(field in args)) continue;
		const supplied = args[field];
		if (supplied !== expected)
			throw new IndustryAgentError(
				"SANDBOX_TOOL_HANDOFF_INVALID",
				`Tool handoff attempted to override server scope field ${field}`,
			);
		delete args[field];
	}
	return { toolName, toolVersion, purpose, args };
}

export function validateRouteDecision(
	value: unknown,
	availableTools: readonly ToolDefinition[],
	context: RequestContext,
	maxActions: number,
): SandboxRouteDecision {
	if (!record(value))
		throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Planner route decision must be an object");
	const usage = validateSandboxUsage(value.usage);
	const kind = value.kind;
	if (kind === "SANDBOX_REQUIRED") return { kind, reason: text(value.reason, "sandbox route reason", 2000), usage };
	if (kind === "ASK_USER") return { kind, question: text(value.question, "sandbox route question", 2000), usage };
	if (kind === "FAIL") return { kind, reason: text(value.reason, "sandbox route failure", 2000), usage };
	if (kind === "USE_EXISTING_TOOLS") {
		const rawActions = value.actions;
		if (!Array.isArray(rawActions) || !rawActions.length)
			throw new IndustryAgentError(
				"SANDBOX_TOOL_HANDOFF_INVALID",
				"USE_EXISTING_TOOLS requires at least one action",
			);
		if (rawActions.length > maxActions)
			throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", `Tool handoff exceeds max actions ${maxActions}`);
		const map = new Map(availableTools.map((tool) => [`${tool.name}@${tool.version}`, tool] as const));
		const actions = rawActions.map((item) => {
			if (!record(item) || !record(item.args))
				throw new IndustryAgentError(
					"SANDBOX_TOOL_HANDOFF_INVALID",
					"Tool handoff action must contain object args",
				);
			return validateToolAction(
				{
					toolName: String(item.toolName ?? ""),
					toolVersion: String(item.toolVersion ?? ""),
					args: item.args as JsonObject,
					purpose: String(item.purpose ?? ""),
				},
				map,
				context,
			);
		});
		return { kind, actions, usage };
	}
	throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", `Unsupported sandbox route decision: ${String(kind)}`);
}

export function validateGeneratedProgram(value: unknown): { program: SandboxProgram; usage: SandboxUsage } {
	if (!record(value) || !record(value.program))
		throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Planner generate result must contain program");
	const raw = value.program;
	if (!Array.isArray(raw.queries))
		throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Generated program queries must be an array");
	const queries = raw.queries.map((item) => {
		if (!record(item) || !Array.isArray(item.referencedTables))
			throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Generated SQL query has invalid shape");
		return {
			queryId: String(item.queryId ?? ""),
			sql: String(item.sql ?? ""),
			referencedTables: item.referencedTables.map((table) => String(table)),
		};
	});
	return {
		program: {
			programId: String(raw.programId ?? ""),
			queries,
			python: String(raw.python ?? ""),
			explanation: String(raw.explanation ?? ""),
		},
		usage: validateSandboxUsage(value.usage),
	};
}

function validateCell(value: unknown, type: string, label: string): void {
	if (value === null) return;
	if (type === "STRING" && typeof value !== "string")
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} must be string/null`);
	if (type === "NUMBER" && (typeof value !== "number" || !Number.isFinite(value)))
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} must be finite number/null`);
	if (type === "BOOLEAN" && typeof value !== "boolean")
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} must be boolean/null`);
	if (
		type === "DATE" &&
		(typeof value !== "string" ||
			!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
			Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
	)
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} must be ISO date/null`);
	if (type === "DATETIME" && (typeof value !== "string" || Number.isNaN(Date.parse(value))))
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} must be ISO datetime/null`);
}

export function validateBrokerResult(
	result: SandboxBrokerResult,
	context: RequestContext,
	schema: SandboxSchemaSnapshot,
	queryId: string,
	limits: SandboxLimits,
): SandboxBrokerResult {
	if (result.queryId !== queryId)
		throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Broker queryId mismatch: ${result.queryId}`);
	if (result.schemaSnapshotId !== schema.snapshotId)
		throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", "Broker schema snapshot mismatch");
	if (!sameScope(result.scope, scopeFromContext(context)))
		throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", "Broker result escaped server request scope");
	if (
		result.attestation.readOnlyEnforced !== true ||
		result.attestation.serverScopeEnforced !== true ||
		result.attestation.sqlPolicyRevalidated !== true ||
		result.attestation.schemaAllowlistEnforced !== true ||
		result.attestation.statementTimeoutEnforced !== true ||
		result.attestation.queryCostGuardEnforced !== true ||
		result.attestation.credentialsExposedToSandbox !== false ||
		!result.attestation.policyVersion.trim()
	) {
		throw new IndustryAgentError(
			"SANDBOX_BROKER_REJECTED",
			"Broker did not attest read-only server-scope enforcement",
		);
	}
	if (!result.columns.length)
		throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", "Broker result must declare columns");
	if (result.rows.length > limits.maxRowsPerQuery)
		throw new IndustryAgentError(
			"SANDBOX_LIMIT_EXCEEDED",
			`Broker result exceeds max rows ${limits.maxRowsPerQuery}`,
		);
	const columnMap = new Map<string, string>();
	for (const column of result.columns) {
		const key = text(column.key, "broker column key", 128);
		text(column.label, "broker column label", 256);
		if (!COLUMN_TYPES.has(column.type))
			throw new IndustryAgentError(
				"SANDBOX_BROKER_REJECTED",
				`Unsupported broker column type: ${String(column.type)}`,
			);
		if (columnMap.has(key))
			throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Duplicate broker column: ${key}`);
		columnMap.set(key, column.type);
	}
	for (const [rowIndex, row] of result.rows.entries()) {
		for (const key of Object.keys(row))
			if (!columnMap.has(key))
				throw new IndustryAgentError(
					"SANDBOX_BROKER_REJECTED",
					`Broker row ${rowIndex} contains undeclared field: ${key}`,
				);
		for (const [key, value] of Object.entries(row)) {
			validateCell(value, columnMap.get(key)!, `Broker row ${rowIndex} field ${key}`);
			if (typeof value === "string" && value.length > limits.maxCellChars)
				throw new IndustryAgentError(
					"SANDBOX_LIMIT_EXCEEDED",
					`Broker row ${rowIndex} field ${key} exceeds max cell characters`,
				);
		}
	}
	const brokerChars = JSON.stringify({ columns: result.columns, rows: result.rows }).length;
	if (brokerChars > limits.maxBrokerResultChars)
		throw new IndustryAgentError(
			"SANDBOX_LIMIT_EXCEEDED",
			`Broker result exceeds max serialized characters ${limits.maxBrokerResultChars}`,
		);
	if (!result.evidence.length)
		throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", "Broker result must include source evidence");
	const evidenceIds = new Set<string>();
	for (const evidence of result.evidence) {
		const evidenceId = text(evidence.evidenceId, "broker evidenceId", 256);
		if (evidenceIds.has(evidenceId))
			throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Duplicate broker evidence: ${evidenceId}`);
		evidenceIds.add(evidenceId);
		text(evidence.sourceId, `broker evidence ${evidenceId} sourceId`, 512);
		text(evidence.sourceVersion, `broker evidence ${evidenceId} sourceVersion`, 256);
		if (evidence.updatedAt !== undefined && Number.isNaN(Date.parse(evidence.updatedAt)))
			throw new IndustryAgentError("SANDBOX_BROKER_REJECTED", `Broker evidence ${evidenceId} updatedAt is invalid`);
	}
	for (const ref of result.entityRefs) {
		text(ref.entityType, "broker entityType", 128);
		text(ref.entityId, "broker entityId", 256);
		if (!evidenceIds.has(ref.evidenceId))
			throw new IndustryAgentError(
				"SANDBOX_BROKER_REJECTED",
				`Entity ref cites unknown evidence: ${ref.evidenceId}`,
			);
	}
	return result;
}

export function pythonSha256(source: string): string {
	return createHash("sha256").update(source, "utf8").digest("hex");
}

export function validateRuntimeAttestation(
	attestation: SandboxRuntimeAttestation,
	python: string,
	limits: SandboxLimits,
): SandboxRuntimeAttestation {
	if (!attestation.runtimeVersion.trim())
		throw new IndustryAgentError("SANDBOX_RUNTIME_ATTESTATION_FAILED", "Sandbox runtimeVersion is required");
	if (attestation.executedPythonSha256 !== pythonSha256(python))
		throw new IndustryAgentError("SANDBOX_RUNTIME_ATTESTATION_FAILED", "Sandbox executed Python checksum mismatch");
	if (
		attestation.networkDisabled !== true ||
		attestation.filesystemDisabled !== true ||
		attestation.processSpawnDisabled !== true ||
		attestation.environmentSecretsExposed !== false ||
		attestation.importsDisabled !== true ||
		attestation.dynamicCodeDisabled !== true ||
		attestation.dataAccessMode !== "QUERY_ID_ONLY" ||
		attestation.abortTerminatesExecution !== true
	)
		throw new IndustryAgentError("SANDBOX_RUNTIME_ATTESTATION_FAILED", "Sandbox runtime safety attestation failed");
	if (
		!Number.isFinite(attestation.cpuTimeMs) ||
		attestation.cpuTimeMs < 0 ||
		attestation.cpuTimeMs > limits.maxSandboxCpuMs
	)
		throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox CPU time exceeded");
	if (
		!Number.isInteger(attestation.memoryPeakBytes) ||
		attestation.memoryPeakBytes < 0 ||
		attestation.memoryPeakBytes > limits.maxSandboxMemoryBytes
	)
		throw new IndustryAgentError("SANDBOX_LIMIT_EXCEEDED", "Sandbox memory limit exceeded");
	return attestation;
}

function validateSourceQueryIds(ids: readonly string[], readQueryIds: ReadonlySet<string>, label: string): void {
	if (!ids.length) throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} must cite sourceQueryIds`);
	const unique = new Set(ids);
	if (unique.size !== ids.length)
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} sourceQueryIds must be unique`);
	for (const id of ids)
		if (!readQueryIds.has(id))
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `${label} cites a query that was not read: ${id}`);
}

export function validateExecutionOutput(
	output: SandboxExecutionOutput,
	readQueryIds: readonly string[],
	limits: SandboxLimits,
): SandboxExecutionOutput {
	const readSet = new Set(readQueryIds);
	if (!readSet.size)
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", "Sandbox executed without reading any approved query");
	if (output.tables.length > limits.maxOutputTables)
		throw new IndustryAgentError(
			"SANDBOX_LIMIT_EXCEEDED",
			`Sandbox output exceeds max tables ${limits.maxOutputTables}`,
		);
	let totalRows = 0;
	const tables = new Map<string, SandboxExecutionOutput["tables"][number]>();
	for (const table of output.tables) {
		const tableId = text(table.tableId, "output tableId", 256);
		text(table.name, `output table ${tableId} name`, 500);
		if (tables.has(tableId))
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Duplicate output table: ${tableId}`);
		validateSourceQueryIds(table.sourceQueryIds, readSet, `Output table ${tableId}`);
		if (!table.columns.length)
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Output table ${tableId} has no columns`);
		const columnMap = new Map<string, string>();
		for (const column of table.columns) {
			const key = text(column.key, `output table ${tableId} column`, 128);
			text(column.label, `output table ${tableId} label`, 256);
			if (!COLUMN_TYPES.has(column.type))
				throw new IndustryAgentError(
					"SANDBOX_OUTPUT_INVALID",
					`Output table ${tableId} has unsupported column type`,
				);
			if (columnMap.has(key))
				throw new IndustryAgentError(
					"SANDBOX_OUTPUT_INVALID",
					`Output table ${tableId} has duplicate column ${key}`,
				);
			columnMap.set(key, column.type);
		}
		totalRows += table.rows.length;
		if (totalRows > limits.maxOutputRows)
			throw new IndustryAgentError(
				"SANDBOX_LIMIT_EXCEEDED",
				`Sandbox output exceeds max rows ${limits.maxOutputRows}`,
			);
		for (const [rowIndex, row] of table.rows.entries()) {
			for (const key of Object.keys(row))
				if (!columnMap.has(key))
					throw new IndustryAgentError(
						"SANDBOX_OUTPUT_INVALID",
						`Output table ${tableId} row ${rowIndex} contains undeclared field: ${key}`,
					);
			for (const [key, value] of Object.entries(row)) {
				validateCell(value, columnMap.get(key)!, `Output table ${tableId} row ${rowIndex} field ${key}`);
				if (typeof value === "string" && value.length > limits.maxCellChars)
					throw new IndustryAgentError(
						"SANDBOX_LIMIT_EXCEEDED",
						`Output table ${tableId} row ${rowIndex} field ${key} exceeds max cell characters`,
					);
			}
		}
		tables.set(tableId, table);
	}
	for (const narrative of output.narrative) {
		const sectionId = text(narrative.sectionId, "output narrative sectionId", 256);
		text(narrative.heading, `output narrative ${sectionId} heading`, 500);
		const body = text(narrative.body, `output narrative ${sectionId} body`, Math.max(1000, limits.maxOutputChars));
		if (/<\/?[A-Za-z][^>]*>/.test(body))
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Output narrative ${sectionId} contains raw HTML`);
		validateSourceQueryIds(narrative.sourceQueryIds, readSet, `Output narrative ${sectionId}`);
	}
	for (const chart of output.charts) {
		const chartId = text(chart.chartId, "output chartId", 256);
		text(chart.title, `output chart ${chartId} title`, 500);
		if (!CHART_TYPES.has(chart.type))
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Output chart ${chartId} has unsupported type`);
		const table = tables.get(chart.tableId);
		if (!table)
			throw new IndustryAgentError(
				"SANDBOX_OUTPUT_INVALID",
				`Output chart ${chartId} references unknown table: ${chart.tableId}`,
			);
		validateSourceQueryIds(chart.sourceQueryIds, readSet, `Output chart ${chartId}`);
		for (const queryId of chart.sourceQueryIds)
			if (!table.sourceQueryIds.includes(queryId))
				throw new IndustryAgentError(
					"SANDBOX_OUTPUT_INVALID",
					`Output chart ${chartId} cites query outside its table provenance`,
				);
		const columnTypes = new Map(table.columns.map((column) => [column.key, column.type] as const));
		if (!columnTypes.has(chart.categoryColumn))
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Output chart ${chartId} category column is unknown`);
		if (!chart.valueColumns.length || (chart.type === "PIE" && chart.valueColumns.length !== 1))
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Output chart ${chartId} has invalid value columns`);
		if (new Set(chart.valueColumns).size !== chart.valueColumns.length)
			throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", `Output chart ${chartId} value columns must be unique`);
		for (const valueColumn of chart.valueColumns)
			if (columnTypes.get(valueColumn) !== "NUMBER")
				throw new IndustryAgentError(
					"SANDBOX_OUTPUT_INVALID",
					`Output chart ${chartId} value column must be NUMBER: ${valueColumn}`,
				);
	}
	if (output.answer !== undefined) text(output.answer, "sandbox answer", limits.maxOutputChars);
	const serializedLength = JSON.stringify(output).length;
	if (serializedLength > limits.maxOutputChars)
		throw new IndustryAgentError(
			"SANDBOX_LIMIT_EXCEEDED",
			`Sandbox output exceeds max serialized characters ${limits.maxOutputChars}`,
		);
	if (!output.tables.length && !output.narrative.length && !output.answer)
		throw new IndustryAgentError("SANDBOX_OUTPUT_INVALID", "Sandbox produced no usable output");
	return output;
}

export function validateVerificationDecision(value: unknown): SandboxVerificationDecision {
	if (!record(value))
		throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Sandbox verifier decision must be an object");
	const usage = validateSandboxUsage(value.usage);
	const kind = value.kind;
	if (kind === "ACCEPT") return { kind, summary: text(value.summary, "verification summary", 10000), usage };
	if (kind === "ASK_USER") return { kind, question: text(value.question, "verification question", 2000), usage };
	if (kind === "FAIL") return { kind, reason: text(value.reason, "verification failure", 5000), usage };
	if (kind === "MUTATION_REQUIRED") {
		if (
			!record(value.recommendation) ||
			!record(value.recommendation.values) ||
			!Array.isArray(value.recommendation.targetEntityIds) ||
			!Array.isArray(value.recommendation.evidenceQueryIds)
		) {
			throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Mutation recommendation has invalid shape");
		}
		const recommendation: SandboxMutationRecommendation = {
			operation: String(value.recommendation.operation) as SandboxMutationRecommendation["operation"],
			entityType: String(value.recommendation.entityType ?? ""),
			targetEntityIds: value.recommendation.targetEntityIds.map((item) => String(item)),
			values: value.recommendation.values as JsonObject,
			...(value.recommendation.reason === undefined ? {} : { reason: String(value.recommendation.reason) }),
			evidenceQueryIds: value.recommendation.evidenceQueryIds.map((item) => String(item)),
		};
		if (!["CREATE", "UPDATE", "DELETE"].includes(recommendation.operation))
			throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", "Mutation recommendation has unsupported operation");
		return { kind, summary: text(value.summary, "verification summary", 10000), recommendation, usage };
	}
	throw new IndustryAgentError("SANDBOX_EXECUTION_FAILED", `Unsupported sandbox verifier decision: ${String(kind)}`);
}

export function validateMutationRecommendation(
	recommendation: SandboxMutationRecommendation,
	readQueryIds: readonly string[],
	brokerResults: readonly SandboxBrokerResult[],
): SandboxMutationRecommendation {
	const entityType = text(recommendation.entityType, "mutation entityType", 128);
	if (!recommendation.evidenceQueryIds.length)
		throw new IndustryAgentError(
			"SANDBOX_MUTATION_TARGET_INVALID",
			"Mutation recommendation requires evidenceQueryIds",
		);
	const evidenceQueryIds = recommendation.evidenceQueryIds.map((queryId) =>
		text(queryId, "mutation evidenceQueryId", 128),
	);
	if (new Set(evidenceQueryIds).size !== evidenceQueryIds.length)
		throw new IndustryAgentError("SANDBOX_MUTATION_TARGET_INVALID", "Mutation evidenceQueryIds must be unique");
	const readSet = new Set(readQueryIds);
	for (const queryId of evidenceQueryIds)
		if (!readSet.has(queryId))
			throw new IndustryAgentError(
				"SANDBOX_MUTATION_TARGET_INVALID",
				`Mutation recommendation cites unread query: ${queryId}`,
			);
	const refs = new Map<string, string>();
	for (const result of brokerResults) {
		if (!evidenceQueryIds.includes(result.queryId)) continue;
		for (const ref of result.entityRefs) refs.set(`${ref.entityType}\u0000${ref.entityId}`, ref.evidenceId);
	}
	const targetEntityIds = recommendation.targetEntityIds.map((entityId) =>
		text(entityId, "mutation target entityId", 256),
	);
	if (recommendation.operation === "CREATE") {
		if (targetEntityIds.length)
			throw new IndustryAgentError(
				"SANDBOX_MUTATION_TARGET_INVALID",
				"CREATE recommendation cannot contain target entity ids",
			);
	} else {
		if (!targetEntityIds.length)
			throw new IndustryAgentError(
				"SANDBOX_MUTATION_TARGET_INVALID",
				`${recommendation.operation} recommendation requires target entity ids`,
			);
		if (new Set(targetEntityIds).size !== targetEntityIds.length)
			throw new IndustryAgentError("SANDBOX_MUTATION_TARGET_INVALID", "Mutation target entity ids must be unique");
		for (const entityId of targetEntityIds) {
			if (!refs.has(`${entityType}\u0000${entityId}`))
				throw new IndustryAgentError(
					"SANDBOX_MUTATION_TARGET_INVALID",
					`Mutation target was not returned by authoritative broker evidence: ${entityType}/${entityId}`,
				);
		}
	}
	if (recommendation.operation === "DELETE" && Object.keys(recommendation.values).length)
		throw new IndustryAgentError(
			"SANDBOX_MUTATION_TARGET_INVALID",
			"DELETE recommendation must not carry mutation values",
		);
	return { ...recommendation, entityType, targetEntityIds, evidenceQueryIds };
}

export function sandboxTraceDetails(details: Readonly<Record<string, unknown>>): JsonObject {
	return { ...details };
}
