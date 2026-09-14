import { describe, expect, it } from "vitest";
import { validateReadOnlySqlQuery } from "../src/sandbox/sql-validator.ts";
import { sandboxLimits, sandboxSchema } from "./sandbox-helpers.ts";

describe("M12 SQL static validation", () => {
	it("accepts explicit bounded SELECT", () => {
		const result = validateReadOnlySqlQuery(
			{
				queryId: "q1",
				sql: "SELECT ledger_id, ledger_name FROM vw_boq_read LIMIT 10",
				referencedTables: ["vw_boq_read"],
			},
			sandboxSchema(),
			sandboxLimits(),
		);
		expect(result.limit).toBe(10);
	});

	it.each([
		"UPDATE vw_boq_read SET ledger_name = 'x' LIMIT 1",
		"SELECT * FROM vw_boq_read LIMIT 1",
		"SELECT LOAD_FILE('/etc/passwd') FROM vw_boq_read LIMIT 1",
		"SELECT ledger_id FROM mysql.user LIMIT 1",
		"SELECT ledger_id FROM vw_boq_read; SELECT ledger_id FROM vw_boq_read LIMIT 1",
	])("rejects unsafe SQL: %s", (sql) => {
		expect(() =>
			validateReadOnlySqlQuery(
				{ queryId: "q1", sql, referencedTables: ["vw_boq_read"] },
				sandboxSchema(),
				sandboxLimits(),
			),
		).toThrow();
	});
});
