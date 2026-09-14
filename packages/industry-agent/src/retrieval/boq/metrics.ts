import type { BoqBenchmarkMetrics, BoqBenchmarkObservation } from "./types.ts";

function ratio(numerator: number, denominator: number): number {
	return denominator > 0 ? numerator / denominator : 0;
}
function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
	return sorted[index] ?? 0;
}
function reciprocalRank(expected: ReadonlySet<string>, ranked: readonly string[]): number {
	const index = ranked.findIndex((id) => expected.has(id));
	return index < 0 ? 0 : 1 / (index + 1);
}

export function calculateBoqBenchmarkMetrics(observations: readonly BoqBenchmarkObservation[]): BoqBenchmarkMetrics {
	const codeCases = observations.filter((o) => o.codeExactExpected);
	const hierarchyCases = observations.filter((o) => o.hierarchyExpectedCount !== undefined);
	const autoAcceptCases = observations.filter((o) => o.autoAccept);
	let recall10 = 0;
	let hit1 = 0;
	let mrr = 0;
	let zero = 0;
	for (const observation of observations) {
		const expected = new Set(observation.expectedLedgerIds);
		if (observation.rankedLedgerIds.slice(0, 10).some((id) => expected.has(id))) recall10 += 1;
		if (observation.rankedLedgerIds[0] && expected.has(observation.rankedLedgerIds[0])) hit1 += 1;
		mrr += reciprocalRank(expected, observation.rankedLedgerIds);
		if (observation.rankedLedgerIds.length === 0) zero += 1;
	}
	return {
		queryCount: observations.length,
		codeExactAccuracy: ratio(
			codeCases.filter((o) => o.rankedLedgerIds[0] && o.expectedLedgerIds.includes(o.rankedLedgerIds[0])).length,
			codeCases.length,
		),
		hierarchyAccuracy: ratio(
			hierarchyCases.filter((o) => o.rankedLedgerIds.length >= (o.hierarchyExpectedCount ?? 0)).length,
			hierarchyCases.length,
		),
		recallAt10: ratio(recall10, observations.length),
		hitAt1: ratio(hit1, observations.length),
		mrr: ratio(mrr, observations.length),
		specConflictTop1Rate: ratio(observations.filter((o) => o.criticalSpecConflictTop1).length, observations.length),
		ambiguityPrecision: ratio(autoAcceptCases.filter((o) => o.autoAcceptCorrect).length, autoAcceptCases.length),
		zeroResultRate: ratio(zero, observations.length),
		p50LatencyMs: percentile(
			observations.map((o) => o.latencyMs),
			0.5,
		),
		p95LatencyMs: percentile(
			observations.map((o) => o.latencyMs),
			0.95,
		),
	};
}
