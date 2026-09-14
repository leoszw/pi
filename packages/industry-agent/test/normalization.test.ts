import { describe, expect, it } from "vitest";
import { extractBoqCode, normalizeBoqCode } from "../src/normalization/boq-code.ts";
import { extractChainage, normalizeChainage } from "../src/normalization/chainage.ts";
import { extractDate, normalizeDateExpression } from "../src/normalization/date.ts";
import { normalizeSide } from "../src/normalization/side.ts";
import { normalizeUnit } from "../src/normalization/unit.ts";

describe("Phase 2 normalizers", () => {
	it("normalizes chainage and ranges to meter numbers", () => {
		expect(normalizeChainage("K12+300")).toBe(12300);
		expect(extractChainage("K12+800 至 K12+300").range?.value).toEqual([12300, 12800]);
	});

	it("rejects invalid chainage instead of creating a hard filter", () => {
		expect(normalizeChainage("K12+1200")).toBeUndefined();
		expect(extractChainage("K12+1200")).toEqual({});
	});

	it("distinguishes reliable and colloquial side expressions", () => {
		expect(normalizeSide("左幅")).toMatchObject({ value: "LEFT", confidence: 0.99, mode: "hard" });
		expect(normalizeSide("左边")).toMatchObject({ value: "LEFT", confidence: 0.88, mode: "soft" });
		expect(normalizeSide("L")).toMatchObject({ value: "LEFT", mode: "hard" });
	});

	it("normalizes common engineering units without matching generic pronouns", () => {
		expect(normalizeUnit("单位m3")).toMatchObject({ value: "m3", mode: "hard" });
		expect(normalizeUnit("平方米")).toMatchObject({ value: "m2", mode: "hard" });
		expect(normalizeUnit("这个清单项")).toBeUndefined();
	});

	it("canonicalizes BOQ codes only when the code syntax is valid", () => {
		expect(normalizeBoqCode("202－1_a")).toBe("202-1-A");
		expect(extractBoqCode("查询清单编号202-1-a")).toMatchObject({ value: "202-1-A", mode: "hard" });
		expect(normalizeBoqCode("202--1")).toBeUndefined();
	});

	it("normalizes absolute, relative, and ranged dates deterministically", () => {
		const referenceDate = new Date("2026-09-11T12:00:00.000Z");
		expect(normalizeDateExpression("今天", referenceDate)).toBe("2026-09-11");
		expect(normalizeDateExpression("昨天", referenceDate)).toBe("2026-09-10");
		expect(normalizeDateExpression("2026年9月12日", referenceDate)).toBe("2026-09-12");
		expect(normalizeDateExpression("2026-02-30", referenceDate)).toBeUndefined();
		expect(extractDate("2026-09-10 至 2026-09-12", referenceDate).range?.value).toEqual(["2026-09-10", "2026-09-12"]);
	});
});
