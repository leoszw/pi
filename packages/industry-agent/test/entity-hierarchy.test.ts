import { describe, expect, it } from "vitest";
import { buildEntityHierarchyPath } from "../src/entity/hierarchy.ts";
import { InMemoryEntityRepository } from "../src/entity/in-memory-entity-repository.ts";
import type { CanonicalEntity } from "../src/entity/types.ts";

function node(entityId: string, name: string, parentEntityId?: string): CanonicalEntity {
	return {
		entityId,
		entityType: "ENGINEERING_POSITION",
		canonicalName: name,
		parentEntityId,
		scope: { tenantId: "tenant-1", projectId: "project-1" },
		sourceSystem: "engineering",
		sourceRecordId: entityId,
		sourceVersion: "v1",
		status: "ACTIVE",
		attributes: {},
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
	};
}

describe("buildEntityHierarchyPath", () => {
	it("builds a real root-to-leaf path", async () => {
		const repository = new InMemoryEntityRepository();
		await repository.upsertEntity(node("root", "大桥"));
		await repository.upsertEntity(node("child", "0#盖梁", "root"));

		const path = await buildEntityHierarchyPath("child", repository, { tenantId: "tenant-1", projectId: "project-1" });
		expect(path.entityIds).toEqual(["root", "child"]);
		expect(path.names).toEqual(["大桥", "0#盖梁"]);
		expect(path.incomplete).toBe(false);
	});

	it("does not invent a missing parent", async () => {
		const repository = new InMemoryEntityRepository();
		await repository.upsertEntity(node("child", "203-1-a-1", "missing-parent"));
		const path = await buildEntityHierarchyPath("child", repository, { tenantId: "tenant-1", projectId: "project-1" });
		expect(path.entityIds).toEqual(["child"]);
		expect(path.incomplete).toBe(true);
		expect(path.missingParentEntityId).toBe("missing-parent");
	});

	it("rejects hierarchy cycles", async () => {
		const repository = new InMemoryEntityRepository();
		await repository.upsertEntity(node("a", "A", "b"));
		await repository.upsertEntity(node("b", "B", "a"));
		await expect(buildEntityHierarchyPath("a", repository, { tenantId: "tenant-1", projectId: "project-1" })).rejects.toThrow(
			"entity hierarchy cycle detected",
		);
	});
});
