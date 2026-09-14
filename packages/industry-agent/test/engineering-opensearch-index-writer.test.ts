import { describe, expect, it } from "vitest";
import { OpenSearchEngineeringIndexWriter } from "../src/retrieval/engineering/opensearch-index-writer.ts";
import type { EngineeringSearchDocument } from "../src/retrieval/engineering/types.ts";

const document: EngineeringSearchDocument = {
	engineeringId: "470359026153164800",
	projectId: "468664890983321600",
	ancestorIds: [],
	pathNames: ["盖梁"],
	pathText: "盖梁",
	depth: 1,
	engineeringName: "盖梁",
	alignmentSide: "RIGHT_WIDTH",
	localSide: "NONE",
	positionTokens: [],
	aliasTerms: [],
	crossAlignment: false,
	isMinUnit: true,
	isDeleted: false,
	semanticName: "盖梁",
	semanticPath: "盖梁",
	searchText: "盖梁",
	embeddingNameText: "工程部位：盖梁",
	embeddingContextText: "工程路径：盖梁",
	rerankText: "工程部位：盖梁",
	embeddingVersion: "bge-m3-v1",
	embeddingInputHash: "hash",
	indexVersion: "v1",
	nameVector: [0, 1],
	contextVector: [1, 0],
};

describe("OpenSearchEngineeringIndexWriter", () => {
	it("uses string ids and preserves vectors during structure-only updates", async () => {
		const calls: Array<{ op: string; id: string; body?: Readonly<Record<string, unknown>> }> = [];
		const writer = new OpenSearchEngineeringIndexWriter({
			indexName: "engineering_position_v1",
			transport: {
				async index(_index, id, body) {
					calls.push({ op: "index", id, body });
				},
				async update(_index, id, body) {
					calls.push({ op: "update", id, body });
				},
				async delete(_index, id) {
					calls.push({ op: "delete", id });
				},
			},
		});
		await writer.upsert(document, { preserveExistingVectors: true });
		expect(calls[0]?.id).toBe("470359026153164800");
		const serialized = JSON.stringify(calls[0]?.body);
		expect(serialized).not.toContain("name_vector");
		expect(serialized).not.toContain("context_vector");
	});
});
