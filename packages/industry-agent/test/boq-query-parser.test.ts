import { describe, expect, it } from "vitest";
import { parseBoqQuery } from "../src/retrieval/boq/query-parser.ts";
const catalog = { knownCodes: new Set(["403-2-a"]), knownAncestorCodes: new Set(["403-2"]), sections: [{ sectionId: "4", sectionName: "桥梁工程" }] };

describe("BOQ query parser", () => {
	it("keeps operation independent from code query mode", () => {
		const parsed = parseBoqQuery({ query: "403－2a 的变更后数量", projectId: "670701177435987968", catalog });
		expect(parsed.operation).toBe("FACT_LOOKUP");
		expect(parsed.queryMode).toBe("CODE");
		expect(parsed.ledgerCode).toBe("403-2-a");
		expect(parsed.factFields).toEqual(["change_after_num"]);
	});
	it("routes descendants without dense lookup", () => {
		const parsed = parseBoqQuery({ query: "403-2 下面有哪些", projectId: "p", catalog });
		expect(parsed.operation).toBe("LIST_DESCENDANTS");
		expect(parsed.ancestorCode).toBe("403-2");
	});
	it("does not recognize unvalidated three-digit specs as codes", () => {
		const parsed = parseBoqQuery({ query: "厚200mm混凝土", projectId: "p", catalog });
		expect(parsed.ledgerCode).toBe(undefined);
		expect(parsed.queryMode).toBe("SPEC");
	});
});
