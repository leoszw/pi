import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { SandboxLimits, SandboxSchemaSnapshot, SandboxSqlQuery } from "./types.ts";

type SqlTokenKind = "WORD" | "STRING" | "IDENT" | "NUMBER" | "SYMBOL";

interface SqlToken {
	kind: SqlTokenKind;
	value: string;
	upper: string;
}

const FORBIDDEN_WORDS = new Set([
	"INSERT", "UPDATE", "DELETE", "REPLACE", "MERGE", "UPSERT",
	"CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME",
	"GRANT", "REVOKE", "SET", "USE", "CALL", "DO", "HANDLER", "LOAD",
	"LOCK", "UNLOCK", "ANALYZE", "OPTIMIZE", "REPAIR", "FLUSH", "KILL",
	"INTO", "OUTFILE", "DUMPFILE", "PROCEDURE", "RECURSIVE", "FOR", "OFFSET",
]);

const FORBIDDEN_SCHEMAS = new Set(["INFORMATION_SCHEMA", "MYSQL", "PERFORMANCE_SCHEMA", "SYS"]);
const FORBIDDEN_FUNCTIONS = new Set([
	"LOAD_FILE", "SLEEP", "BENCHMARK", "GET_LOCK", "RELEASE_LOCK", "IS_USED_LOCK",
	"MASTER_POS_WAIT", "UUID_SHORT",
]);

function fail(queryId: string, message: string): never {
	throw new IndustryAgentError("SANDBOX_STATIC_VALIDATION_FAILED", `SQL ${queryId}: ${message}`);
}

function tokenize(queryId: string, sql: string): SqlToken[] {
	const tokens: SqlToken[] = [];
	let i = 0;
	while (i < sql.length) {
		const ch = sql[i]!;
		if (/\s/.test(ch)) { i += 1; continue; }
		if (ch === "\0") fail(queryId, "NUL bytes are not allowed");
		if ((ch === "-" && sql[i + 1] === "-") || ch === "#" || (ch === "/" && sql[i + 1] === "*")) fail(queryId, "SQL comments are not allowed");
		if (ch === "'" || ch === "\"") {
			const quote = ch;
			let value = ch;
			i += 1;
			let closed = false;
			while (i < sql.length) {
				const current = sql[i]!;
				value += current;
				if (current === "\\") {
					i += 1;
					if (i < sql.length) value += sql[i]!;
					i += 1;
					continue;
				}
				if (current === quote) {
					if (sql[i + 1] === quote) {
						value += quote;
						i += 2;
						continue;
					}
					i += 1;
					closed = true;
					break;
				}
				i += 1;
			}
			if (!closed) fail(queryId, "unterminated string literal");
			tokens.push({ kind: "STRING", value, upper: value.toUpperCase() });
			continue;
		}
		if (ch === "`") {
			let value = "";
			i += 1;
			let closed = false;
			while (i < sql.length) {
				const current = sql[i]!;
				if (current === "`") {
					if (sql[i + 1] === "`") {
						value += "`";
						i += 2;
						continue;
					}
					i += 1;
					closed = true;
					break;
				}
				value += current;
				i += 1;
			}
			if (!closed || !value.trim()) fail(queryId, "invalid quoted identifier");
			tokens.push({ kind: "IDENT", value, upper: value.toUpperCase() });
			continue;
		}
		if (/[A-Za-z_]/.test(ch)) {
			let value = ch;
			i += 1;
			while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i]!)) { value += sql[i]!; i += 1; }
			tokens.push({ kind: "WORD", value, upper: value.toUpperCase() });
			continue;
		}
		if (/[0-9]/.test(ch)) {
			let value = ch;
			i += 1;
			while (i < sql.length && /[0-9.]/.test(sql[i]!)) { value += sql[i]!; i += 1; }
			tokens.push({ kind: "NUMBER", value, upper: value });
			continue;
		}
		if (ch === "@") fail(queryId, "SQL user/system variables are not allowed");
		tokens.push({ kind: "SYMBOL", value: ch, upper: ch });
		i += 1;
	}
	return tokens;
}

function isIdentifier(token: SqlToken | undefined): token is SqlToken {
	return token !== undefined && (token.kind === "WORD" || token.kind === "IDENT");
}

function matchingParen(tokens: readonly SqlToken[], start: number, queryId: string): number {
	if (tokens[start]?.value !== "(") fail(queryId, "expected opening parenthesis");
	let depth = 0;
	for (let i = start; i < tokens.length; i += 1) {
		if (tokens[i]!.value === "(") depth += 1;
		else if (tokens[i]!.value === ")") {
			depth -= 1;
			if (depth === 0) return i;
			if (depth < 0) break;
		}
	}
	fail(queryId, "unbalanced parentheses");
}

function collectCteNames(tokens: readonly SqlToken[], queryId: string): ReadonlySet<string> {
	const names = new Set<string>();
	if (tokens[0]?.upper !== "WITH") return names;
	let i = 1;
	while (i < tokens.length) {
		const name = tokens[i];
		if (!isIdentifier(name)) fail(queryId, "invalid CTE name");
		names.add(name.upper);
		i += 1;
		if (tokens[i]?.value === "(") i = matchingParen(tokens, i, queryId) + 1;
		if (tokens[i]?.upper !== "AS" || tokens[i + 1]?.value !== "(") fail(queryId, "CTE must use AS (...)");
		i = matchingParen(tokens, i + 1, queryId) + 1;
		if (tokens[i]?.value === ",") { i += 1; continue; }
		break;
	}
	if (tokens[i]?.upper !== "SELECT") fail(queryId, "WITH query must end in a SELECT statement");
	return names;
}

function extractTableName(tokens: readonly SqlToken[], index: number): { name?: string; next: number } {
	const first = tokens[index];
	if (!isIdentifier(first)) return { next: index + 1 };
	if (tokens[index + 1]?.value === "." && isIdentifier(tokens[index + 2])) {
		return { name: `${first.value}.${tokens[index + 2]!.value}`, next: index + 3 };
	}
	return { name: first.value, next: index + 1 };
}

function extractTables(tokens: readonly SqlToken[], cteNames: ReadonlySet<string>): readonly string[] {
	const output = new Set<string>();
	for (let i = 0; i < tokens.length; i += 1) {
		if (tokens[i]!.upper !== "FROM" && tokens[i]!.upper !== "JOIN") continue;
		const next = tokens[i + 1];
		if (next?.value === "(") continue;
		const parsed = extractTableName(tokens, i + 1);
		if (!parsed.name) continue;
		const leaf = parsed.name.split(".").at(-1)!.toUpperCase();
		if (!cteNames.has(leaf)) output.add(parsed.name);
	}
	return [...output];
}


function rejectCommaJoins(tokens: readonly SqlToken[], queryId: string): void {
	let depth = 0;
	const fromDepths = new Set<number>();
	const endClauses = new Set(["WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "UNION", "EXCEPT", "INTERSECT", "WINDOW"]);
	for (const token of tokens) {
		if (token.value === "(") { depth += 1; continue; }
		if (token.value === ")") {
			fromDepths.delete(depth);
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (token.upper === "FROM") { fromDepths.add(depth); continue; }
		if (token.kind === "WORD" && endClauses.has(token.upper)) { fromDepths.delete(depth); continue; }
		if (token.value === "," && fromDepths.has(depth)) fail(queryId, "comma joins are not allowed; use explicit JOIN");
	}
}

function normalizedName(value: string): string {
	return value.replace(/`/g, "").trim().toLowerCase();
}

export interface SqlValidationResult {
	query: SandboxSqlQuery;
	extractedTables: readonly string[];
	limit: number;
}

export function validateReadOnlySqlQuery(query: SandboxSqlQuery, schema: SandboxSchemaSnapshot, limits: SandboxLimits): SqlValidationResult {
	const queryId = query.queryId.trim();
	if (!queryId) throw new IndustryAgentError("SANDBOX_STATIC_VALIDATION_FAILED", "SQL queryId must not be empty");
	const sql = query.sql.trim();
	if (!sql || sql.length > limits.maxSqlChars) fail(queryId, `SQL length must be between 1 and ${limits.maxSqlChars}`);
	if (!query.referencedTables.length) fail(queryId, "referencedTables must not be empty");
	const declared = query.referencedTables.map(normalizedName);
	if (new Set(declared).size !== declared.length) fail(queryId, "referencedTables must be unique");

	const tokens = tokenize(queryId, sql);
	if (!tokens.length) fail(queryId, "query is empty");
	const semicolons = tokens.map((token, index) => token.value === ";" ? index : -1).filter((index) => index >= 0);
	if (semicolons.length > 1 || (semicolons.length === 1 && semicolons[0] !== tokens.length - 1)) fail(queryId, "multiple SQL statements are not allowed");
	const effective = semicolons.length ? tokens.slice(0, -1) : tokens;
	if (!effective.length) fail(queryId, "query is empty");
	if (effective[0]!.upper !== "SELECT" && effective[0]!.upper !== "WITH") fail(queryId, "only SELECT statements are allowed");
	for (const token of effective) {
		if (token.kind === "WORD" && FORBIDDEN_WORDS.has(token.upper)) fail(queryId, `forbidden SQL keyword: ${token.upper}`);
		if ((token.kind === "WORD" || token.kind === "IDENT") && FORBIDDEN_SCHEMAS.has(token.upper)) fail(queryId, `system schema is not allowed: ${token.value}`);
		if (token.value === "*") fail(queryId, "wildcard SELECT is not allowed; columns must be explicit");
	}
	for (let i = 0; i < effective.length - 1; i += 1) {
		if ((effective[i]!.kind === "WORD" || effective[i]!.kind === "IDENT") && effective[i + 1]!.value === "(" && FORBIDDEN_FUNCTIONS.has(effective[i]!.upper)) {
			fail(queryId, `forbidden SQL function: ${effective[i]!.upper}`);
		}
	}
	rejectCommaJoins(effective, queryId);
	const cteNames = collectCteNames(effective, queryId);
	const extractedTables = extractTables(effective, cteNames);
	const schemaTables = new Set(schema.tables.map((table) => normalizedName(table.tableName)));
	for (const table of declared) if (!schemaTables.has(table)) fail(queryId, `declared table is not in the sandbox schema snapshot: ${table}`);
	for (const table of extractedTables.map(normalizedName)) {
		if (!schemaTables.has(table)) fail(queryId, `query references table outside the sandbox schema snapshot: ${table}`);
		if (!declared.includes(table)) fail(queryId, `query table is missing from referencedTables: ${table}`);
	}

	const limitIndexes = effective.map((token, index) => token.upper === "LIMIT" ? index : -1).filter((index) => index >= 0);
	if (limitIndexes.length !== 1) fail(queryId, "query must contain exactly one LIMIT clause");
	const limitToken = effective[limitIndexes[0]! + 1];
	if (!limitToken || limitToken.kind !== "NUMBER" || !/^\d+$/.test(limitToken.value)) fail(queryId, "LIMIT must be a positive integer literal");
	const limit = Number(limitToken.value);
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > limits.maxRowsPerQuery) fail(queryId, `LIMIT must be between 1 and ${limits.maxRowsPerQuery}`);
	return { query: { ...query, queryId, sql }, extractedTables, limit };
}
