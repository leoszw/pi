import { describe, expect, it } from "vitest";
import { ENGINEERING_RETRIEVAL_CONFIG_V1 } from "../src/retrieval/engineering/config.ts";
import { EngineeringIndexingService } from "../src/retrieval/engineering/indexer.ts";
import { buildEngineeringSearchDocument } from "../src/retrieval/engineering/text-builder.ts";
import type { EngineeringPositionSourceRow } from "../src/entity/source-adapters.ts";
import type { EngineeringSearchDocument } from "../src/retrieval/engineering/types.ts";

const row: EngineeringPositionSourceRow = {
	engineeringId: "470359026153164800",
	proId: "468664890983321600",
	engineeringName: "0号台盖梁",
	engineeringFullName: "冯家沟大桥右幅0号台盖梁",
	unitEngineeringName: "冯家沟大桥右幅",
	engineeringCategoryName: "桥梁工程",
	engineeringTypeName: "盖梁",
	alignmentCode: "K",
	chainageStartM: 1000,
	chainageEndM: 1000,
	isMinUnit: true,
	isDeleted: false,
	updateTime: "2026-09-11T10:00:00.000Z",
};

const hierarchy = { entityIds: ["root", row.engineeringId], names: ["冯家沟大桥右幅", "0号台盖梁"], depth: 2, incomplete: false } as const;

describe("EngineeringIndexingService", () => {
	it("reuses vectors when embedding input hash and index version are unchanged", async () => {
		const preview = buildEngineeringSearchDocument({ row, hierarchy, aliases: [], embeddingVersion: "bge-m3-v1", indexVersion: "v1" });
		let embedCalls = 0;
		const writes: Array<{ document: EngineeringSearchDocument; preserveExistingVectors: boolean }> = [];
		const service = new EngineeringIndexingService({
			embedding: { modelVersion: "bge-m3-v1", dimension: 1024, async embed() { embedCalls += 1; return Array.from({ length: 1024 }, () => 0); } },
			hierarchy: { async getPath() { return hierarchy; } },
			aliases: { async getAliases() { return []; } },
			state: { async getState() { return { embeddingInputHash: preview.embeddingInputHash, indexVersion: "v1" }; } },
			writer: {
				async upsert(document, options) { writes.push({ document, preserveExistingVectors: options.preserveExistingVectors }); },
				async delete() {},
			},
			config: ENGINEERING_RETRIEVAL_CONFIG_V1,
		});
		const result = await service.indexBatch([row]);
		expect(embedCalls).toBe(0);
		expect(result.structureOnlyUpdated).toBe(1);
		expect(writes[0]?.preserveExistingVectors).toBe(true);
	});

	it("embeds both vector texts when the hash changes and deletes source tombstones", async () => {
		let embedCalls = 0;
		const deleted: string[] = [];
		const written: EngineeringSearchDocument[] = [];
		const service = new EngineeringIndexingService({
			embedding: { modelVersion: "bge-m3-v1", dimension: 1024, async embed() { embedCalls += 1; return Array.from({ length: 1024 }, () => 0.1); } },
			hierarchy: { async getPath() { return hierarchy; } },
			aliases: { async getAliases() { return []; } },
			state: { async getState() { return undefined; } },
			writer: {
				async upsert(document) { written.push(document); },
				async delete(id) { deleted.push(id); },
			},
			config: ENGINEERING_RETRIEVAL_CONFIG_V1,
		});
		const tombstone = { ...row, engineeringId: "470359026153164801", isDeleted: true, updateTime: "2026-09-11T10:01:00.000Z" };
		const result = await service.indexBatch([row, tombstone]);
		expect(embedCalls).toBe(2);
		expect(written[0]?.nameVector).toHaveLength(1024);
		expect(written[0]?.contextVector).toHaveLength(1024);
		expect(deleted).toEqual(["470359026153164801"]);
		expect(result.deleted).toBe(1);
		expect(result.lastCursor?.engineeringId).toBe("470359026153164801");
	});
});
