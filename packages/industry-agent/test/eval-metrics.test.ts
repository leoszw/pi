import { describe, expect, it } from "vitest";
import { computeBenchmarkReport } from "../src/eval/index.ts";

describe("phase 11 metrics", () => {
	it("computes the first-phase metric family", () => {
		const report = computeBenchmarkReport(
			[
				{
					caseId: "c1",
					intent: { gold: "QUERY_BOQ", candidates: ["QUERY_BOQ", "UNKNOWN"], predicted: "QUERY_BOQ" },
					mentions: {
						gold: [{ start: 0, end: 3, label: "BOQ" }],
						predicted: [{ start: 0, end: 3, label: "BOQ" }],
					},
					normalization: { expected: { code: "100.1" }, actual: { code: "100.1" } },
					entity: { relevantIds: ["e1"], rankedIds: ["e1", "e2"] },
					rag: { relevantChunkIds: ["c1"], rankedChunkIds: ["c1", "c2"], grounded: true, citationsCorrect: true },
					tool: { expectedTool: "search_boq", actualTool: "search_boq" },
					mutation: { expectedTargetIds: ["e1"], actualTargetIds: ["e1"] },
					approval: { expectedAllowed: true, actualAllowed: true, expectedDigest: "d1", actualDigest: "d1" },
					trace: { requiredSpans: ["agent", "tool"], observedSpans: ["agent", "tool"] },
					tokens: {
						expected: { llmCalls: 1, inputTokens: 10, outputTokens: 5, cachedTokens: 2, totalTokens: 17 },
						accounted: { llmCalls: 1, inputTokens: 10, outputTokens: 5, cachedTokens: 2, totalTokens: 17 },
					},
					e2e: { success: true, clarified: false, manualStepsBaseline: 5, manualStepsActual: 2 },
				},
			],
			{
				benchmarkVersion: "b1",
				corpusVersion: "c1",
				intentCandidateK: 3,
				ragK: 10,
				generatedAt: "2026-09-12T00:00:00.000Z",
			},
		);
		expect(report.metrics.intentCandidateRecallAtK?.value).toBe(1);
		expect(report.metrics.entityMrr?.value).toBe(1);
		expect(report.metrics.ragNdcgAtK?.value).toBe(1);
		expect(report.metrics.mutationWrongTargetRate?.value).toBe(0);
		expect(report.metrics.approvalConsistency?.value).toBe(1);
		expect(report.metrics.manualStepsSaved?.value).toBe(3);
	});
});
