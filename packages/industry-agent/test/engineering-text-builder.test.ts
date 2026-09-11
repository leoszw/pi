import { describe, expect, it } from "vitest";
import { buildEngineeringSearchDocument } from "../src/retrieval/engineering/text-builder.ts";
import type { EngineeringPositionSourceRow } from "../src/entity/source-adapters.ts";

const baseRow: EngineeringPositionSourceRow = {
	engineeringId: "470359026153164800",
	proId: "468664890983321600",
	unitEngineeringId: "u1",
	unitEngineeringName: "荟萃山隧道右线",
	parentEngineeringId: "p1",
	engineeringName: "K12+401-K12+395 初支仰拱",
	engineeringFullName: "荟萃山隧道右线 K12+401-K12+395 初支仰拱",
	engineeringCategoryName: "隧道工程",
	engineeringTypeName: "初期支护",
	alignmentCode: "K",
	chainageStartM: 12395,
	chainageEndM: 12401,
	crossAlignment: false,
	isMinUnit: true,
	isDeleted: false,
	updateTime: "2026-09-11T00:00:00.000Z",
};

const hierarchy = {
	entityIds: ["root", "p1", "470359026153164800"],
	names: ["荟萃山隧道右线", "初支", "初支仰拱"],
	depth: 3,
	incomplete: false,
} as const;

describe("engineering retrieval text builder", () => {
	it("keeps chainage out of dense text but allows it in rerank text", () => {
		const document = buildEngineeringSearchDocument({ row: baseRow, hierarchy, embeddingVersion: "bge-m3-v1", indexVersion: "v1" });
		expect(document.embeddingNameText).not.toContain("K12+401");
		expect(document.embeddingContextText).not.toContain("K12+395");
		expect(document.rerankText).toContain("12395-12401米");
		expect(document.engineeringId).toBe("470359026153164800");
	});

	it("normalizes 0号台 into a structural position token", () => {
		const row = { ...baseRow, engineeringName: "0号台盖梁", engineeringFullName: "冯家沟大桥右幅 0号台盖梁" };
		const document = buildEngineeringSearchDocument({ row, hierarchy, embeddingVersion: "bge-m3-v1", indexVersion: "v1" });
		expect(document.positionTokens).toContain("0#桥台");
	});

	it("does not change embedding hash for source metadata that is outside embedding text", () => {
		const first = buildEngineeringSearchDocument({ row: baseRow, hierarchy, embeddingVersion: "bge-m3-v1", indexVersion: "v1" });
		const second = buildEngineeringSearchDocument({
			row: { ...baseRow, updateTime: "2026-09-12T00:00:00.000Z" },
			hierarchy,
			embeddingVersion: "bge-m3-v1",
			indexVersion: "v1",
		});
		expect(second.embeddingInputHash).toBe(first.embeddingInputHash);
	});
});
