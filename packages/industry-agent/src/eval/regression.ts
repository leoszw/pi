import type { BenchmarkReport, EvalMetricName, RegressionDiff, ReleaseGateConfig } from "./types.ts";

const LOWER_IS_BETTER = new Set<EvalMetricName>(["mutationWrongTargetRate"]);

export function regressionDiffs(
	baseline: BenchmarkReport,
	candidate: BenchmarkReport,
	config: ReleaseGateConfig,
): readonly RegressionDiff[] {
	const output: RegressionDiff[] = [];
	for (const [metric, rule] of Object.entries(config.metricRules) as [
		EvalMetricName,
		NonNullable<ReleaseGateConfig["metricRules"][EvalMetricName]>,
	][]) {
		if (rule.maxRegression === undefined) continue;
		const before = baseline.metrics[metric]?.value;
		const after = candidate.metrics[metric]?.value;
		if (before === undefined || after === undefined) continue;
		const qualityDelta = LOWER_IS_BETTER.has(metric) ? before - after : after - before;
		output.push({
			metric,
			baseline: before,
			candidate: after,
			qualityDelta,
			regressed: qualityDelta < -rule.maxRegression,
		});
	}
	return output;
}
