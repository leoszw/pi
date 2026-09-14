import type { EngineeringBenchmarkMetrics, EngineeringBenchmarkObservation } from "./types.ts";

function percentile(values: readonly number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1));
	return sorted[index] ?? 0;
}

function hasExpected(observation: EngineeringBenchmarkObservation, topK: number): boolean {
	const expected = new Set(observation.expectedEngineeringIds);
	return observation.rankedEngineeringIds.slice(0, topK).some((id) => expected.has(id));
}

function reciprocalRank(observation: EngineeringBenchmarkObservation): number {
	const expected = new Set(observation.expectedEngineeringIds);
	const index = observation.rankedEngineeringIds.findIndex((id) => expected.has(id));
	return index < 0 ? 0 : 1 / (index + 1);
}

export function computeEngineeringBenchmarkMetrics(
	observations: readonly EngineeringBenchmarkObservation[],
): EngineeringBenchmarkMetrics {
	if (observations.length === 0) {
		return {
			queryCount: 0,
			recallAt20: 0,
			recallAt50: 0,
			hitAt1: 0,
			mrr: 0,
			zeroResultRate: 0,
			constraintConflictRate: 0,
			p50LatencyMs: 0,
			p95LatencyMs: 0,
		};
	}
	const count = observations.length;
	const ratio = (matches: number) => matches / count;
	return {
		queryCount: count,
		recallAt20: ratio(observations.filter((item) => hasExpected(item, 20)).length),
		recallAt50: ratio(observations.filter((item) => hasExpected(item, 50)).length),
		hitAt1: ratio(observations.filter((item) => hasExpected(item, 1)).length),
		mrr: observations.reduce((sum, item) => sum + reciprocalRank(item), 0) / count,
		zeroResultRate: ratio(observations.filter((item) => item.rankedEngineeringIds.length === 0).length),
		constraintConflictRate: ratio(observations.filter((item) => item.constraintConflict).length),
		p50LatencyMs: percentile(
			observations.map((item) => item.latencyMs),
			0.5,
		),
		p95LatencyMs: percentile(
			observations.map((item) => item.latencyMs),
			0.95,
		),
	};
}
