import { describe, expect, it } from "vitest";
import { runOfflineBenchmark } from "../src/eval/index.ts";
import { smallCorpus } from "./eval-helpers.ts";

describe("phase 11 offline runner", () => {
	it("executes every case and preserves corpus order", async () => {
		const corpus = smallCorpus(1);
		const report = await runOfflineBenchmark(
			corpus,
			{
				execute: async (testCase) => ({
					caseId: testCase.id,
					e2e: { success: true, clarified: false, manualStepsBaseline: 3, manualStepsActual: 1 },
				}),
			},
			{
				benchmarkVersion: "b1",
				intentCandidateK: 3,
				ragK: 10,
				concurrency: 4,
				generatedAt: "2026-09-12T00:00:00.000Z",
			},
		);
		expect(report.caseIds).toEqual(corpus.cases.map((item) => item.id));
		expect(report.observationCount).toBe(corpus.cases.length);
	});
});
