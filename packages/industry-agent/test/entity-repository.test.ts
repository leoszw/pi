import { describe, expect, it } from "vitest";
import { InMemoryEntityRepository } from "../src/entity/in-memory-entity-repository.ts";
import type { CanonicalEntity } from "../src/entity/types.ts";

function entity(overrides: Partial<CanonicalEntity> = {}): CanonicalEntity {
	return {
		entityId: "123456789012345678",
		entityType: "ENGINEERING_POSITION",
		canonicalName: "冯家沟大桥右幅 0#盖梁",
		scope: { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" },
		sourceSystem: "engineering",
		sourceRecordId: "123456789012345678",
		sourceVersion: "source-v1",
		indexVersion: "engineering-position-v1",
		status: "ACTIVE",
		attributes: {},
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		...overrides,
	};
}

describe("InMemoryEntityRepository", () => {
	it("keeps large identifiers as strings and enforces tenant/project scope", async () => {
		const repository = new InMemoryEntityRepository();
		await repository.upsertEntity(entity());

		const visible = await repository.getEntityById("123456789012345678", { tenantId: "tenant-1", projectId: "project-1" });
		const hidden = await repository.getEntityById("123456789012345678", { tenantId: "tenant-2", projectId: "project-1" });

		expect(visible?.entityId).toBe("123456789012345678");
		expect(typeof visible?.entityId).toBe("string");
		expect(hidden).toBeUndefined();
	});

	it("normalizes aliases before lookup", async () => {
		const repository = new InMemoryEntityRepository();
		await repository.upsertEntity(entity());
		await repository.upsertAlias({
			aliasId: "alias-1",
			entityId: "123456789012345678",
			alias: "  0＃ 盖梁  ",
			normalizedAlias: "ignored-by-repository",
			aliasType: "BUSINESS",
			source: "SOURCE",
			confidence: 0.99,
			createdAt: "2026-09-11T00:00:00.000Z",
		});

		const found = await repository.findByAlias("0# 盖梁", { tenantId: "tenant-1", projectId: "project-1" });
		expect(found.map((item) => item.entityId)).toEqual(["123456789012345678"]);
	});

	it("stores only embedding metadata, not vectors", async () => {
		const repository = new InMemoryEntityRepository();
		await repository.upsertEntity(entity());
		await repository.upsertEmbeddingMeta({
			metaId: "meta-1",
			entityId: "123456789012345678",
			embeddingProfile: "name",
			embeddingModel: "BAAI/bge-m3",
			embeddingDimension: 1024,
			indexName: "engineering_position_v1",
			indexVersion: "v1",
			documentId: "123456789012345678",
			inputHash: "sha256:abc",
			indexedAt: "2026-09-11T00:00:00.000Z",
			metadata: {},
		});
		const meta = await repository.getEmbeddingMeta("123456789012345678", "name", "v1");
		expect(meta?.embeddingDimension).toBe(1024);
		expect(Object.keys(meta ?? {})).not.toContain("vector");
	});
});
