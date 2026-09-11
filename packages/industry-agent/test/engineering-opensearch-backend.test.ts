import { describe, expect, it } from "vitest";
import { buildEngineeringBm25Query, buildEngineeringKnnQuery } from "../src/retrieval/engineering/opensearch-backend.ts";
import type { ParsedEngineeringQuery } from "../src/retrieval/engineering/types.ts";

const parsed: ParsedEngineeringQuery = {
	rawQuery: "AK0+500 右线仰拱",
	semanticQuery: "右线仰拱",
	projectId: "470359026153164800",
	alignmentCode: "AK",
	alignmentSide: "RIGHT_LINE",
	localSide: "NONE",
	chainageMode: "point",
	chainageStartM: 500,
	chainageEndM: 500,
	crossAlignment: false,
	positionTokens: [],
	aliases: [],
	queryMode: "CHAINAGE",
	confidences: { chainage: 1, alignmentCode: 1, alignmentSide: 1 },
	hints: {},
};

const filters = {
	excludeDeleted: true as const,
	projectId: "470359026153164800",
	alignmentCode: "AK",
	alignmentSide: "RIGHT_LINE" as const,
	chainageStartM: 500,
	chainageEndM: 500,
	crossAlignment: false as const,
};

describe("engineering OpenSearch DSL", () => {
	it("applies project, alignment and interval filters to BM25", () => {
		const query = JSON.stringify(buildEngineeringBm25Query(parsed, filters, 80));
		expect(query).toContain("470359026153164800");
		expect(query).toContain("AK");
		expect(query).toContain("RIGHT_LINE");
		expect(query).toContain("chainage_start_m");
		expect(query).toContain("chainage_end_m");
	});

	it("uses the same common filters for vector search", () => {
		const query = JSON.stringify(buildEngineeringKnnQuery("name_vector", [0, 1], filters, 80));
		expect(query).toContain("name_vector");
		expect(query).toContain("cross_alignment");
		expect(query).toContain("470359026153164800");
	});
});
