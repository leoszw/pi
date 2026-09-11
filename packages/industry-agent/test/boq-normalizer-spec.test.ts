import { describe, expect, it } from "vitest";
import { normalizeLedgerCode, normalizeBoqUnit } from "../src/retrieval/boq/normalizer.ts";
import { extractBoqSpecTokens } from "../src/retrieval/boq/spec-extractor.ts";

describe("BOQ normalization", () => {
	it("normalizes safe ledger-code variants", () => {
		expect(normalizeLedgerCode("403－2a")).toBe("403-2-a");
		expect(normalizeLedgerCode("403 2 a")).toBe("403-2-a");
	});
	it("normalizes units without using unit as leaf identity", () => {
		expect(normalizeBoqUnit("平方米")).toBe("m²");
		expect(normalizeBoqUnit("m3")).toBe("m³");
	});
	it("extracts identity specs", () => {
		const values = extractBoqSpecTokens("C30 HRB400 φ22 4%水泥 厚180mm").map((token) => token.value);
		for (const value of ["C30", "HRB400", "φ22", "PCT4", "T180MM"]) expect(values).toContain(value);
	});
});
