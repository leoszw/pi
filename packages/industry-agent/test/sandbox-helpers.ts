import { createHash } from "node:crypto";
import type { RequestContext, ToolDefinition } from "../src/contracts/index.ts";
import type { MutationPrepareResult } from "../src/mutation/types.ts";
import type { ReportGenerationResult } from "../src/report/types.ts";
import type {
	SandboxBrokerResult,
	SandboxExecutionOutput,
	SandboxLimits,
	SandboxProgram,
	SandboxRuntimeAttestation,
	SandboxSchemaSnapshot,
	SandboxUsage,
} from "../src/sandbox/types.ts";

export function sandboxContext(): RequestContext {
	return { traceId: "trace-1", requestId: "request-1", conversationId: "conversation-1", userId: "user-1", tenantId: "tenant-1", companyId: "company-1", projectId: "project-1", createdAt: "2026-09-12T00:00:00.000Z" };
}

export function sandboxUsage(totalTokens = 10, costUsd = 0.01): SandboxUsage {
	return { inputTokens: 5, outputTokens: 5, cachedTokens: 0, reasoningTokens: 0, totalTokens, costUsd };
}

export function sandboxLimits(): SandboxLimits {
	return {
		maxToolHandoffActions: 4,
		maxQueries: 8,
		maxSqlChars: 10000,
		maxPythonChars: 20000,
		maxBrokerCalls: 8,
		maxRowsPerQuery: 5000,
		maxTotalBrokerRows: 20000,
		maxCellChars: 10000,
		maxBrokerResultChars: 5000000,
		maxTotalBrokerChars: 10000000,
		maxBrokerExecutionMs: 10000,
		maxOutputTables: 10,
		maxOutputRows: 10000,
		maxOutputChars: 5000000,
		maxTotalTokens: 50000,
		maxCostUsd: 2,
		maxDurationMs: 120000,
		maxOperationMs: 15000,
		maxSandboxCpuMs: 10000,
		maxSandboxMemoryBytes: 268435456,
	};
}

export function sandboxSchema(): SandboxSchemaSnapshot {
	return {
		snapshotId: "schema-1",
		version: "schema-v1",
		scope: { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" },
		tables: [{
			tableName: "vw_boq_read",
			description: "Read-only BOQ sandbox view",
			sourceVersion: "source-v1",
			readOnly: true,
			columns: [
				{ name: "ledger_id", dataType: "varchar", nullable: false, sandboxReadable: true, entityType: "BOQ_ITEM" },
				{ name: "ledger_name", dataType: "varchar", nullable: false, sandboxReadable: true },
				{ name: "design_quantity", dataType: "decimal", nullable: true, sandboxReadable: true },
				{ name: "tenant_id", dataType: "varchar", nullable: false, sandboxReadable: true },
				{ name: "company_id", dataType: "varchar", nullable: false, sandboxReadable: true },
				{ name: "project_id", dataType: "varchar", nullable: false, sandboxReadable: true },
			],
			scopeColumns: { tenantId: "tenant_id", companyId: "company_id", projectId: "project_id" },
		}],
	};
}

export function sandboxProgram(): SandboxProgram {
	return {
		programId: "program-1",
		queries: [{ queryId: "q1", sql: "SELECT ledger_id, ledger_name, design_quantity FROM vw_boq_read LIMIT 100", referencedTables: ["vw_boq_read"] }],
		python: "def main(read):\n    rows = read(\"q1\")\n    return rows\n",
		explanation: "Summarize BOQ quantities from a prevalidated read-only query.",
	};
}

export function sandboxBrokerResult(): SandboxBrokerResult {
	return {
		queryId: "q1",
		schemaSnapshotId: "schema-1",
		scope: { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" },
		columns: [
			{ key: "ledger_id", label: "Ledger ID", type: "STRING" },
			{ key: "ledger_name", label: "Name", type: "STRING" },
			{ key: "design_quantity", label: "Design Quantity", type: "NUMBER" },
		],
		rows: [{ ledger_id: "90071992547409931234", ledger_name: "C30 concrete", design_quantity: 12.5 }],
		evidence: [{ evidenceId: "fact-1", sourceId: "boq:90071992547409931234", sourceVersion: "row-v7", updatedAt: "2026-09-12T00:00:00.000Z" }],
		entityRefs: [{ entityType: "BOQ_ITEM", entityId: "90071992547409931234", evidenceId: "fact-1" }],
		attestation: {
			readOnlyEnforced: true,
			serverScopeEnforced: true,
			sqlPolicyRevalidated: true,
			schemaAllowlistEnforced: true,
			statementTimeoutEnforced: true,
			queryCostGuardEnforced: true,
			credentialsExposedToSandbox: false,
			policyVersion: "broker-v1",
		},
	};
}

export function sandboxOutput(): SandboxExecutionOutput {
	return {
		tables: [{
			tableId: "table-1",
			name: "BOQ Quantity",
			columns: [
				{ key: "ledger_name", label: "Name", type: "STRING" },
				{ key: "design_quantity", label: "Design Quantity", type: "NUMBER" },
			],
			rows: [{ ledger_name: "C30 concrete", design_quantity: 12.5 }],
			sourceQueryIds: ["q1"],
		}],
		charts: [{ chartId: "chart-1", title: "Quantity", type: "BAR", tableId: "table-1", categoryColumn: "ledger_name", valueColumns: ["design_quantity"], sourceQueryIds: ["q1"] }],
		narrative: [{ sectionId: "summary", heading: "Summary", body: "The authoritative design quantity is 12.5.", sourceQueryIds: ["q1"] }],
		answer: "The authoritative design quantity is 12.5.",
	};
}

export function sandboxAttestation(python: string): SandboxRuntimeAttestation {
	return {
		networkDisabled: true,
		filesystemDisabled: true,
		processSpawnDisabled: true,
		environmentSecretsExposed: false,
		importsDisabled: true,
		dynamicCodeDisabled: true,
		dataAccessMode: "QUERY_ID_ONLY",
		abortTerminatesExecution: true,
		runtimeVersion: "sandbox-runtime-v1",
		executedPythonSha256: createHash("sha256").update(python, "utf8").digest("hex"),
		cpuTimeMs: 10,
		memoryPeakBytes: 1024 * 1024,
	};
}

export function sandboxReadTool(): ToolDefinition {
	return { name: "query_quantity", version: "1.0.0", domain: "engineering", action: "READ", description: "Read quantity", inputSchema: {}, outputSchema: {}, allowedEntityTypes: ["BOQ_ITEM"], permission: "quantity.read", dataScopeRule: "SERVER_REQUEST_CONTEXT", riskLevel: "LOW", requiresConfirmation: false, supportsDryRun: false, idempotent: true, timeoutMs: 5000 };
}

export function sandboxMutationResult(): MutationPrepareResult {
	return {
		proposal: {
			operationId: "op-1",
			traceId: "trace-1",
			requestId: "request-1",
			operation: "UPDATE",
			entityType: "BOQ_ITEM",
			scope: { userId: "user-1", tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" },
			targets: [{ entityId: "90071992547409931234", recordVersion: "v1", before: { owner: "李四" }, after: { owner: "张三" } }],
			recordVersion: "v1",
			digest: "digest-1",
			affectedCount: 1,
			representativeSamples: [],
			diff: [{ entityId: "90071992547409931234", field: "owner", before: "李四", after: "张三" }],
			status: "PREPARED",
			createdAt: "2026-09-12T00:00:00.000Z",
		},
		uiActions: [{ id: "confirm-1", type: "mutation_confirmation", payload: { operationId: "op-1" } }],
	};
}

export function sandboxReportResult(): ReportGenerationResult {
	return { reportId: "report-1", artifacts: [], uiActions: [{ id: "preview-1", type: "report_preview", payload: { reportId: "report-1" } }] };
}
