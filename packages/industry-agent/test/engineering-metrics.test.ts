import { describe, expect, it } from "vitest";
import { computeEngineeringBenchmarkMetrics } from "../src/retrieval/engineering/metrics.ts";

describe("engineering benchmark metrics", () => {
	it("computes retrieval quality, zero-result, conflicts and latency percentiles", () => {
		const metrics = computeEngineeringBenchmarkMetrics([
			{ expectedEngineeringIds: ["a"], rankedEngineeringIds: ["a", "b"], constraintConflict: false, latencyMs: 10 },
			{ expectedEngineeringIds: ["c"], rankedEngineeringIds: ["x", "c"], constraintConflict: true, latencyMs: 30 },
			{ expectedEngineeringIds: ["d"], rankedEngineeringIds: [], constraintConflict: false, latencyMs: 20 },
		]);
		expect(metrics.hitAt1).toBeCloseTo(1 / 3);
		expect(metrics.recallAt20).toBeCloseTo(2 / 3);
		expect(metrics.mrr).toBeCloseTo(0.5);
		expect(metrics.zeroResultRate).toBeCloseTo(1 / 3);
		expect(metrics.constraintConflictRate).toBeCloseTo(1 / 3);
		expect(metrics.p50LatencyMs).toBe(20);
		expect(metrics.p95LatencyMs).toBe(30);
	});
});
