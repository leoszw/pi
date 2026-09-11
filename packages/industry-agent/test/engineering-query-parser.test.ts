import { describe, expect, it } from "vitest";
import { ENGINEERING_RETRIEVAL_CONFIG_V1 } from "../src/retrieval/engineering/config.ts";
import { buildEngineeringFilterPlan, parseEngineeringQuery, relaxEngineeringFilters } from "../src/retrieval/engineering/query-parser.ts";

describe("engineering query parser", () => {
	it("parses explicit alignment and nearby chainage without losing large project ids", () => {
		const parsed = parseEngineeringQuery({
			query: "AK0+500 右线附近的仰拱",
			projectId: "470359026153164800",
		}, ENGINEERING_RETRIEVAL_CONFIG_V1);
		expect(parsed.projectId).toBe("470359026153164800");
		expect(parsed.alignmentCode).toBe("AK");
		expect(parsed.alignmentSide).toBe("RIGHT_LINE");
		expect(parsed.chainageStartM).toBe(450);
		expect(parsed.chainageEndM).toBe(550);
		expect(parsed.queryMode).toBe("CHAINAGE");
	});

	it("does not confuse local right side with right width or right line", () => {
		const parsed = parseEngineeringQuery({ query: "右侧坡顶截水沟", projectId: "p1" }, ENGINEERING_RETRIEVAL_CONFIG_V1);
		expect(parsed.localSide).toBe("RIGHT");
		expect(parsed.alignmentSide).toBe("NONE");
	});

	it("does not apply an ordinary interval hard filter across different alignments", () => {
		const parsed = parseEngineeringQuery({ query: "GK0+065至FK0+175工程部位", projectId: "p1" }, ENGINEERING_RETRIEVAL_CONFIG_V1);
		const plan = buildEngineeringFilterPlan(parsed);
		expect(parsed.crossAlignment).toBe(true);
		expect(plan.filters.chainageStartM).toBeUndefined();
		expect(plan.filters.alignmentCode).toBeUndefined();
	});

	it("normalizes structural position tokens such as 0号台", () => {
		const parsed = parseEngineeringQuery({ query: "冯家沟大桥右幅0号台盖梁", projectId: "p1" }, ENGINEERING_RETRIEVAL_CONFIG_V1);
		expect(parsed.positionTokens).toContain("0#桥台");
	});

	it("relaxes only low-confidence resolver filters and never the project scope", () => {
		const parsed = parseEngineeringQuery({
			query: "盖梁",
			projectId: "p1",
			hints: { engineeringTypeName: { value: "盖梁", confidence: 0.8, mode: "hard", source: "resolver" } },
		}, ENGINEERING_RETRIEVAL_CONFIG_V1);
		const relaxed = relaxEngineeringFilters(buildEngineeringFilterPlan(parsed));
		expect(relaxed.relaxed).toEqual(["engineeringTypeName"]);
		expect(relaxed.filters.projectId).toBe("p1");
		expect(relaxed.filters.engineeringTypeName).toBeUndefined();
	});
});
