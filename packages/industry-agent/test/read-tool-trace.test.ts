import { describe, expect, it } from "vitest";
import { ReadToolRuntime } from "../src/tools/read/runtime.ts";
import { InMemoryReadToolPermissionService } from "../src/tools/read/permissions.ts";
import { InMemoryReadDataRepository, StaticBoqCatalogProvider } from "../src/tools/read/in-memory.ts";

const scope = { userId: "u1", tenantId: "t1", companyId: "c1", projectId: "p1" };
const context = { ...scope, traceId: "tr1", requestId: "r1", conversationId: "cv1", createdAt: "2026-09-12T00:00:00.000Z" };

describe("READ tool Trace integration", () => {
	it("records both successful and failed tool calls", async () => {
		const events: string[] = [];
		const runtime = new ReadToolRuntime({
			permissionService: new InMemoryReadToolPermissionService([{ ...scope, permissions: ["documents.list"] }]), dataRepository: new InMemoryReadDataRepository(),
			engineeringSearch: { async search() { return { parsedQuery: {}, confidence: {}, results: [] }; } }, boqSearch: { async search() { return { parsedQuery: {}, confidence: {}, results: [] }; } }, boqCatalog: new StaticBoqCatalogProvider([]),
			trace: { recordToolStart(id) { events.push(`start:${id}`); }, recordToolEnd(id, _name, _output, isError) { events.push(`end:${id}:${isError}`); } },
		});
		await runtime.execute({ toolCallId: "ok", toolName: "list_project_documents", toolVersion: "1.0.0", args: {}, context });
		await runtime.execute({ toolCallId: "bad", toolName: "list_project_documents", toolVersion: "1.0.0", args: { projectId: "evil" }, context });
		expect(events).toEqual(["start:ok", "end:ok:false", "start:bad", "end:bad:true"]);
	});
});
