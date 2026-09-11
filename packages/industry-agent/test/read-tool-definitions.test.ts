import { describe, expect, it } from "vitest";
import { READ_TOOL_DEFINITIONS } from "../src/tools/read/definitions.ts";

describe("Phase 6 READ tool definitions", () => {
	it("declares exactly the six Phase 6 tools with safe read metadata", () => {
		expect(READ_TOOL_DEFINITIONS.map((item) => item.name)).toEqual([
			"search_engineering_positions", "get_engineering_position", "search_boq", "get_boq_item", "query_quantity", "list_project_documents",
		]);
		for (const definition of READ_TOOL_DEFINITIONS) {
			expect(["READ", "SEARCH"]).toContain(definition.action);
			expect(definition.requiresConfirmation).toBe(false);
			expect(definition.idempotent).toBe(true);
			expect(definition.riskLevel).toBe("LOW");
			expect(definition.permission).toBeTruthy();
			expect(definition.dataScopeRule).toContain("SERVER_REQUEST_CONTEXT");
			expect(definition.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
			expect(definition.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
		}
	});
});
