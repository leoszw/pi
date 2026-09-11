import { describe, expect, it } from "vitest";
import { ReadToolRuntime } from "../src/tools/read/runtime.ts";
import { InMemoryReadToolPermissionService } from "../src/tools/read/permissions.ts";
import { InMemoryReadDataRepository, StaticBoqCatalogProvider } from "../src/tools/read/in-memory.ts";

const scope = { userId: "u1", tenantId: "t1", companyId: "c1", projectId: "470359026153164800" };
const context = { ...scope, traceId: "tr1", requestId: "r1", conversationId: "cv1", createdAt: "2026-09-12T00:00:00.000Z" };
function runtime(permissions: readonly string[] = ["documents.list"]) {
	return new ReadToolRuntime({
		permissionService: new InMemoryReadToolPermissionService([{ ...scope, permissions }]), dataRepository: new InMemoryReadDataRepository(),
		engineeringSearch: { async search() { return { parsedQuery: {}, confidence: {}, results: [] }; } },
		boqSearch: { async search() { return { parsedQuery: {}, confidence: {}, results: [] }; } }, boqCatalog: new StaticBoqCatalogProvider([]),
	});
}

describe("ReadToolRuntime", () => {
	it("rejects scope override arguments", async () => {
		const result = await runtime(["boq.read"]).execute({ toolCallId: "1", toolName: "get_boq_item", toolVersion: "1.0.0", args: { ledgerId: "1", projectId: "evil" }, context });
		expect(result).toMatchObject({ ok: false, error: { code: "TOOL_INPUT_INVALID" } });
	});
	it("requires server-bound company and project scope", async () => {
		const result = await runtime().execute({ toolCallId: "2", toolName: "list_project_documents", toolVersion: "1.0.0", args: {}, context: { ...context, projectId: undefined } });
		expect(result).toMatchObject({ ok: false, error: { code: "TOOL_SCOPE_REQUIRED" } });
	});
	it("enforces exact scoped permissions", async () => {
		const result = await runtime([]).execute({ toolCallId: "3", toolName: "list_project_documents", toolVersion: "1.0.0", args: {}, context });
		expect(result).toMatchObject({ ok: false, error: { code: "TOOL_ACCESS_DENIED" } });
	});
});
