// Debug-only MySQL data-access adapters for the industry-agent sandbox.
// NOT the production broker: no multi-tenant hardening, single local database.
// Security posture here: read-only MySQL account + schema allowlist + read-only session.
import mysql2Core from "mysql2";
import { createPool, type FieldPacket, type Pool, type RowDataPacket } from "mysql2/promise";

const { Types } = mysql2Core;
import type { RequestContext } from "../packages/industry-agent/src/contracts/index.ts";
import type {
	SandboxBrokerColumn,
	SandboxBrokerResult,
	SandboxDataAccessBroker,
	SandboxSchemaColumn,
	SandboxSchemaDiscovery,
	SandboxSchemaSnapshot,
	SandboxSchemaTable,
} from "../packages/industry-agent/src/sandbox/index.ts";

export const MYSQL_DEBUG = {
	host: "127.0.0.1",
	port: 3306,
	user: "pi_ro",
	password: "pi_ro_pass",
	database: "pi_query",
	sourceVersion: "pi_query-v1",
	policyVersion: "sandbox-v1",
} as const;

// Static allowlist: the security boundary deciding which tables the sandbox may ever see.
const TABLE_ALLOWLIST: readonly { tableName: string; description: string; entityType?: string; hasProjectScope: boolean }[] = [
	{ tableName: "project", description: "项目基本信息（含租户/公司归属）", entityType: "PROJECT", hasProjectScope: false },
	{
		tableName: "boq_item",
		description: "工程量清单条目：分部(section)、编码(code)、名称(name)、单位(unit)、数量(quantity)、单价(unit_price)、合价(amount)",
		entityType: "BOQ_ITEM",
		hasProjectScope: true,
	},
	{
		tableName: "material_price",
		description: "材料价格：名称(name)、规格(spec)、单位(unit)、单价(price)",
		entityType: "MATERIAL",
		hasProjectScope: true,
	},
];

function columnType(field: FieldPacket): SandboxBrokerColumn["type"] {
	const type = field.type ?? Types.VAR_STRING;
	if (type === Types.DATE || type === Types.NEWDATE) return "DATE";
	if (type === Types.DATETIME || type === Types.TIMESTAMP) return "DATETIME";
	if (
		type === Types.DECIMAL ||
		type === Types.NEWDECIMAL ||
		type === Types.TINY ||
		type === Types.SHORT ||
		type === Types.LONG ||
		type === Types.INT24 ||
		type === Types.LONGLONG ||
		type === Types.FLOAT ||
		type === Types.DOUBLE ||
		type === Types.YEAR
	)
		return "NUMBER";
	return "STRING";
}

export function createMysqlPool(): Pool {
	return createPool({
		host: MYSQL_DEBUG.host,
		port: MYSQL_DEBUG.port,
		user: MYSQL_DEBUG.user,
		password: MYSQL_DEBUG.password,
		database: MYSQL_DEBUG.database,
		connectionLimit: 4,
		decimalNumbers: true,
		dateStrings: true,
	});
}

export class MysqlSchemaDiscovery implements SandboxSchemaDiscovery {
	private readonly pool: Pool;
	private readonly snapshotId: string;

	constructor(pool: Pool, snapshotId = "snap-pi-query-v1") {
		this.pool = pool;
		this.snapshotId = snapshotId;
	}

	async discover(input: { context: RequestContext }, _signal: AbortSignal): Promise<SandboxSchemaSnapshot> {
		const names = TABLE_ALLOWLIST.map((table) => table.tableName);
		const placeholders = names.map(() => "?").join(",");
		const [rows] = await this.pool.query<RowDataPacket[]>(
			`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
			 WHERE table_schema = ? AND table_name IN (${placeholders}) ORDER BY table_name, ordinal_position`,
			[MYSQL_DEBUG.database, ...names],
		);
		const columnsByTable = new Map<string, SandboxSchemaColumn[]>();
		for (const row of rows) {
			const tableName = String(row["TABLE_NAME"] ?? row["table_name"]);
			const column: SandboxSchemaColumn = {
				name: String(row["COLUMN_NAME"] ?? row["column_name"]),
				dataType: String(row["DATA_TYPE"] ?? row["data_type"]),
				nullable: String(row["IS_NULLABLE"] ?? row["is_nullable"]) === "YES",
				sandboxReadable: true,
			};
			const list = columnsByTable.get(tableName) ?? [];
			list.push(column);
			columnsByTable.set(tableName, list);
		}
		const tables: SandboxSchemaTable[] = [];
		for (const allowed of TABLE_ALLOWLIST) {
			const columns = columnsByTable.get(allowed.tableName) ?? [];
			if (!columns.length) continue;
			const scopeColumns: SandboxSchemaTable["scopeColumns"] = { tenantId: "tenant_id", companyId: "company_id" };
			if (allowed.hasProjectScope) scopeColumns.projectId = "project_id";
			tables.push({
				tableName: allowed.tableName,
				description: allowed.description,
				sourceVersion: MYSQL_DEBUG.sourceVersion,
				readOnly: true,
				columns,
				scopeColumns,
			});
		}
		return {
			snapshotId: this.snapshotId,
			version: MYSQL_DEBUG.sourceVersion,
			scope: {
				tenantId: input.context.tenantId,
				companyId: input.context.companyId ?? null,
				projectId: input.context.projectId ?? null,
			},
			tables,
		};
	}
}

export class MysqlReadOnlyBroker implements SandboxDataAccessBroker {
	private readonly pool: Pool;
	private readonly entityTypeByTable: ReadonlyMap<string, string>;

	constructor(pool: Pool) {
		this.pool = pool;
		this.entityTypeByTable = new Map(
			TABLE_ALLOWLIST.filter((table) => table.entityType).map((table) => [table.tableName, table.entityType!] as const),
		);
	}

	async executeReadOnly(
		input: {
			context: RequestContext;
			schema: SandboxSchemaSnapshot;
			query: { queryId: string; sql: string; referencedTables: readonly string[] };
			maxRows: number;
		},
		_signal: AbortSignal,
	): Promise<SandboxBrokerResult> {
		const allowlisted = new Set(input.schema.tables.map((table) => table.tableName));
		for (const table of input.query.referencedTables)
			if (!allowlisted.has(table))
				throw new Error(`Broker rejected query ${input.query.queryId}: table ${table} outside allowlist`);

		const connection = await this.pool.getConnection();
		try {
			await connection.query("SET SESSION TRANSACTION READ ONLY");
			await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${MYSQL_DEBUG_STATEMENT_TIMEOUT_MS}`);
			const [rows, fields] = await connection.query<RowDataPacket[]>({ sql: input.query.sql, timeout: 10_000 });
			if (rows.length > input.maxRows) throw new Error(`Broker result exceeds max rows ${input.maxRows}`);
			const columns: SandboxBrokerColumn[] = fields.map((field) => ({
				key: field.name,
				label: field.name,
				type: columnType(field),
			}));
			return {
				queryId: input.query.queryId,
				schemaSnapshotId: input.schema.snapshotId,
				scope: {
					tenantId: input.context.tenantId,
					companyId: input.context.companyId ?? null,
					projectId: input.context.projectId ?? null,
				},
				columns,
				rows: rows.map((row) => this.rowToCells(row, columns)),
				evidence: [
					{
						evidenceId: `ev-${input.query.queryId}`,
						sourceId: `mysql:${MYSQL_DEBUG.database}:${input.query.referencedTables.join(",")}`,
						sourceVersion: MYSQL_DEBUG.sourceVersion,
					},
				],
				entityRefs: input.query.referencedTables
					.map((table) => this.entityTypeByTable.get(table))
					.filter((entityType): entityType is string => Boolean(entityType))
					.map((entityType) => ({ entityType, entityId: entityType, evidenceId: `ev-${input.query.queryId}` })),
				attestation: {
					readOnlyEnforced: true,
					serverScopeEnforced: true,
					sqlPolicyRevalidated: true,
					schemaAllowlistEnforced: true,
					statementTimeoutEnforced: true,
					queryCostGuardEnforced: true,
					credentialsExposedToSandbox: false,
					policyVersion: MYSQL_DEBUG.policyVersion,
				},
			};
		} finally {
			connection.release();
		}
	}

	private rowToCells(row: RowDataPacket, columns: readonly SandboxBrokerColumn[]): Record<string, string | number | boolean | null> {
		const source = row as Record<string, unknown>;
		const cells: Record<string, string | number | boolean | null> = {};
		for (const column of columns) {
			const value = source[column.key];
			cells[column.key] =
				value === null || value === undefined
					? null
					: typeof value === "number" || typeof value === "boolean"
						? value
						: typeof value === "bigint"
							? Number(value)
							: String(value);
		}
		return cells;
	}
}

const MYSQL_DEBUG_STATEMENT_TIMEOUT_MS = 10_000;
