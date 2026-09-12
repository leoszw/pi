import { describe, expect, it } from "vitest";
import { validateGoldenCorpus } from "../src/eval/index.ts";
import { smallCorpus } from "./eval-helpers.ts";

describe("phase 11 corpus validation", () => {
	it("requires balanced category coverage and unique cases", () => {
		const corpus = smallCorpus(2);
		expect(validateGoldenCorpus(corpus, 38, 2).valid).toBe(true);
		const duplicate = { ...corpus, cases: [...corpus.cases, corpus.cases[0]!] };
		expect(validateGoldenCorpus(duplicate, 38, 2).issues.some((item) => item.code === "DUPLICATE_ID")).toBe(true);
	});
});
