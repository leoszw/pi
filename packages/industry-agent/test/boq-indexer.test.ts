import { describe, expect, it } from "vitest";
import { BOQ_RETRIEVAL_CONFIG_V1 } from "../src/retrieval/boq/config.ts";
import { BoqIndexingService } from "../src/retrieval/boq/indexer.ts";

describe("BOQ indexer", () => {
	it("deletes tombstones and recommends hierarchy rebuild", async () => {
		let deleted = "";
		const service = new BoqIndexingService({
			embedding: {
				modelVersion: "bge-m3-boq-v1",
				dimension: 1024,
				async embed() {
					return Array(1024).fill(0);
				},
			},
			hierarchy: {
				async getHierarchy() {
					throw new Error("unused");
				},
			},
			aliases: {
				async getAliases() {
					return [];
				},
			},
			state: {
				async getState() {
					return undefined;
				},
			},
			writer: {
				async upsert() {},
				async delete(id) {
					deleted = id;
				},
			},
			config: BOQ_RETRIEVAL_CONFIG_V1,
		});
		const result = await service.indexBatch([
			{
				ledgerId: "670701177435987968",
				proId: "p",
				ledgerCodeRaw: "403-2-a",
				ledgerCodeNorm: "403-2-a",
				ledgerNameRaw: "钢筋",
				ledgerNameNorm: "钢筋",
				isDeleted: true,
				updateTime: "2026-09-11T00:00:00Z",
			},
		]);
		expect(deleted).toBe("670701177435987968");
		expect(result.fullRebuildRecommended).toBe(true);
	});
	it("preserves vectors for unchanged embedding input", async () => {
		let preserve = false,
			embeds = 0;
		const row = {
			ledgerId: "1",
			proId: "p",
			ledgerCodeRaw: "403",
			ledgerCodeNorm: "403",
			ledgerNameRaw: "钢筋",
			ledgerNameNorm: "钢筋",
			isDeleted: false,
		};
		const hierarchy = {
			codeSegments: ["403"],
			ancestorCodes: [],
			existingAncestorCodes: [],
			missingAncestorCodes: [],
			hierarchyGap: false,
			depth: 1,
			hasChildren: false,
			isLeaf: true,
			pathNames: ["钢筋"],
			pathText: "钢筋",
		};
		const { buildBoqSearchDocument } = await import("../src/retrieval/boq/text-builder.ts");
		const doc = buildBoqSearchDocument({ row, hierarchy, aliases: [], config: BOQ_RETRIEVAL_CONFIG_V1 });
		const service = new BoqIndexingService({
			embedding: {
				modelVersion: "bge-m3-boq-v1",
				dimension: 1024,
				async embed() {
					embeds++;
					return Array(1024).fill(0);
				},
			},
			hierarchy: {
				async getHierarchy() {
					return hierarchy;
				},
			},
			aliases: {
				async getAliases() {
					return [];
				},
			},
			state: {
				async getState() {
					return { embeddingInputHash: doc.embeddingInputHash, indexVersion: "v1", ledgerCodeNorm: "403" };
				},
			},
			writer: {
				async upsert(_doc, options) {
					preserve = options.preserveExistingVectors;
				},
				async delete() {},
			},
			config: BOQ_RETRIEVAL_CONFIG_V1,
		});
		const result = await service.indexBatch([row]);
		expect(preserve).toBe(true);
		expect(embeds).toBe(0);
		expect(result.structureOnlyUpdated).toBe(1);
	});
});
