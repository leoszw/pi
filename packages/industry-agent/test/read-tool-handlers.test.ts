import { describe, expect, it } from "vitest";
import { InMemoryReadDataRepository, StaticBoqCatalogProvider } from "../src/tools/read/in-memory.ts";
import { InMemoryReadToolPermissionService } from "../src/tools/read/permissions.ts";
import { ReadToolRuntime } from "../src/tools/read/runtime.ts";
import { stubBoqSearchResponse, stubEngineeringSearchResponse } from "./read-tool-stubs.ts";

const scope = { userId: "u1", tenantId: "t1", companyId: "c1", projectId: "470359026153164800" };
const context = {
	...scope,
	traceId: "tr1",
	requestId: "r1",
	conversationId: "cv1",
	createdAt: "2026-09-12T00:00:00.000Z",
};
const permissions = ["engineering.position.search", "boq.search", "quantity.read", "documents.list"];

describe("Phase 6 READ handlers", () => {
	it("injects project scope and server BOQ catalog and preserves raw quantity facts", async () => {
		let engineeringProject = "",
			boqProject = "",
			catalogSeen = false;
		const runtime = new ReadToolRuntime({
			permissionService: new InMemoryReadToolPermissionService([{ ...scope, permissions }]),
			dataRepository: new InMemoryReadDataRepository({
				quantities: [
					{
						scope,
						value: {
							entityType: "BOQ_ITEM",
							entityId: "670701177435987968",
							projectId: scope.projectId,
							values: { contract_num: -1 },
							evidence: { sourceId: "670701177435987968", sourceVersion: "v3", unit: "kg" },
						},
					},
				],
				documents: [{ scope, value: { documentId: "d1", projectId: scope.projectId, name: "施工组织设计.pdf" } }],
			}),
			engineeringSearch: {
				async search(request) {
					engineeringProject = request.projectId;
					return stubEngineeringSearchResponse(request);
				},
			},
			boqSearch: {
				async search(request) {
					boqProject = request.projectId;
					catalogSeen = request.catalog.knownCodes.has("403-2-a");
					return stubBoqSearchResponse(request);
				},
			},
			boqCatalog: new StaticBoqCatalogProvider([
				{ scope, catalog: { knownCodes: new Set(["403-2-a"]), knownAncestorCodes: new Set(["403-2"]) } },
			]),
		});
		expect(
			(
				await runtime.execute({
					toolCallId: "1",
					toolName: "search_engineering_positions",
					toolVersion: "1.0.0",
					args: { query: "盖梁" },
					context,
				})
			).ok,
		).toBe(true);
		expect(
			(
				await runtime.execute({
					toolCallId: "2",
					toolName: "search_boq",
					toolVersion: "1.0.0",
					args: { query: "403-2-a" },
					context,
				})
			).ok,
		).toBe(true);
		const quantity = await runtime.execute({
			toolCallId: "3",
			toolName: "query_quantity",
			toolVersion: "1.0.0",
			args: { entityType: "BOQ_ITEM", entityId: "670701177435987968", fields: ["contract_num"] },
			context,
		});
		expect(engineeringProject).toBe(scope.projectId);
		expect(boqProject).toBe(scope.projectId);
		expect(catalogSeen).toBe(true);
		expect(quantity.data).toMatchObject({
			values: { contract_num: -1 },
			evidence: { sourceId: "670701177435987968", sourceVersion: "v3", unit: "kg" },
		});
	});
});
