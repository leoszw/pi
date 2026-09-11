import { describe, expect, it } from "vitest";
import { weightedRrf } from "../src/retrieval/engineering/fusion.ts";
import type { EngineeringSearchDocument } from "../src/retrieval/engineering/types.ts";

function document(id: string): EngineeringSearchDocument {
	return {
		engineeringId: id,
		projectId: "p1",
		ancestorIds: [],
		pathNames: [id],
		pathText: id,
		depth: 1,
		engineeringName: id,
		alignmentSide: "NONE",
		localSide: "NONE",
		positionTokens: [],
		aliasTerms: [],
		crossAlignment: false,
		isMinUnit: true,
		isDeleted: false,
		semanticName: id,
		semanticPath: id,
		searchText: id,
		embeddingNameText: id,
		embeddingContextText: id,
		rerankText: id,
		embeddingVersion: "v1",
		embeddingInputHash: id,
		indexVersion: "v1",
	};
}

describe("weighted RRF", () => {
	it("uses rank positions instead of raw score domains", () => {
		const a = document("a");
		const b = document("b");
		const result = weightedRrf({
			exact: [{ document: a, rawScore: 0.01 }],
			bm25: [{ document: b, rawScore: 9999 }, { document: a, rawScore: 0.1 }],
			name: [{ document: a, rawScore: -200 }],
			context: [{ document: b, rawScore: 100 }],
		}, { exact: 0.2, bm25: 0.3, name: 0.3, context: 0.2 }, 60);
		expect(result[0]?.document.engineeringId).toBe("a");
		expect(result[0]?.armRanks).toEqual({ exact: 1, bm25: 2, name: 1 });
	});
});
