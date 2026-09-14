import { describe, expect, it } from "vitest";
import { weightedBoqRrf } from "../src/retrieval/boq/fusion.ts";
import type { BoqSearchDocument } from "../src/retrieval/boq/types.ts";

const doc = {
	ledgerId: "1",
	projectId: "p",
	ledgerCodeRaw: "403",
	ledgerCodeNorm: "403",
	codeSegments: ["403"],
	ancestorCodes: [],
	existingAncestorCodes: [],
	missingAncestorCodes: [],
	hierarchyGap: false,
	depth: 1,
	hasChildren: false,
	isLeaf: true,
	ledgerNameRaw: "钢筋",
	ledgerNameNorm: "钢筋",
	pathNames: ["钢筋"],
	pathText: "钢筋",
	specTokens: [],
	specFamilies: [],
	aliasTerms: [],
	searchText: "钢筋",
	embeddingItemText: "",
	embeddingContextText: "",
	rerankText: "",
	embeddingVersion: "v",
	normalizerVersion: "v",
	aliasVersion: "v",
	specPatternVersion: "v",
	embeddingInputHash: "h",
	indexVersion: "v",
	isDeleted: false,
} satisfies BoqSearchDocument;

describe("BOQ weighted RRF", () => {
	it("normalizes by the theoretical active-arm upper bound, not current top1", () => {
		const fused = weightedBoqRrf(
			{ exact: [{ document: doc }], bm25: [], item: [], context: [] },
			{ exact: 0.3, bm25: 0.25, item: 0.3, context: 0.15 },
			["exact", "bm25", "item", "context"],
			60,
		);
		expect(Math.round(fused[0]!.fusionNorm * 100)).toBe(30);
	});
});
