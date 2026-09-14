import { describe, expect, it } from "vitest";
import { weightedRrf } from "../src/rag/qa/fusion.ts";
import { chunk, document } from "./rag-qa-helpers.ts";

describe("weighted rrf", () => {
	it("fuses ranks rather than raw scores", () => {
		const d = document();
		const a = { chunk: chunk("a"), document: d, score: 999, arm: "BM25" as const };
		const b = { chunk: chunk("b"), document: d, score: 0.01, arm: "DENSE" as const };
		const out = weightedRrf({ BM25: [a], DENSE: [b] }, { BM25: 0.5, DENSE: 0.5, ENTITY: 0 }, 60, 10);
		expect(out).toHaveLength(2);
		expect(out[0]?.rrfNorm).toBeCloseTo(0.5);
		expect(out[1]?.rrfNorm).toBeCloseTo(0.5);
	});
});
