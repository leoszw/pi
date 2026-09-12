import {
	EVAL_CATEGORIES,
	EVAL_METRIC_NAMES,
	type BenchmarkReport,
	type EvalMetricName,
	type GoldenCorpus,
	type ReleaseComponentManifest,
	type ReleaseGateConfig,
} from "../src/eval/index.ts";

export function smallCorpus(perCategory = 2): GoldenCorpus {
	return {
		version: "test-corpus-v1",
		generatorVersion: "test",
		cases: EVAL_CATEGORIES.flatMap((category) => Array.from({ length: perCategory }, (_, index) => ({
			id: `${category}-${index}`,
			category,
			kind: "HARD" as const,
			input: { text: `${category}-${index}` },
			expected: { ok: true },
			tags: ["test", "hard"],
		}))),
	};
}

export function gateConfig(perCategory = 2): ReleaseGateConfig {
	const metricRules: Partial<Record<EvalMetricName, { min?: number; max?: number; minSamples?: number; maxRegression?: number }>> = {};
	for (const metric of EVAL_METRIC_NAMES) metricRules[metric] = { min: 0.8, minSamples: 1, maxRegression: 0.02 };
	metricRules.mutationWrongTargetRate = { max: 0, minSamples: 1, maxRegression: 0 };
	metricRules.clarificationRate = { minSamples: 1 };
	metricRules.manualStepsSaved = { min: 2, minSamples: 1, maxRegression: 0.25 };
	metricRules.approvalConsistency = { min: 1, minSamples: 1, maxRegression: 0 };
	return {
		version: "gate-test-v1",
		minCorpusCases: EVAL_CATEGORIES.length * perCategory,
		minCasesPerCategory: perCategory,
		minBenchmarkCoverage: 1,
		requiredCategories: EVAL_CATEGORIES,
		criticalE2ECaseIds: [],
		intentCandidateK: 3,
		ragK: 10,
		metricRules,
	};
}

export function fullReport(overrides: Partial<Record<EvalMetricName, number>> = {}): BenchmarkReport {
	const metrics: Partial<Record<EvalMetricName, { value: number; samples: number }>> = {};
	for (const metric of EVAL_METRIC_NAMES) metrics[metric] = { value: 0.99, samples: 100 };
	metrics.mutationWrongTargetRate = { value: 0, samples: 100 };
	metrics.clarificationRate = { value: 0.1, samples: 100 };
	metrics.manualStepsSaved = { value: 3, samples: 100 };
	metrics.approvalConsistency = { value: 1, samples: 100 };
	for (const [metric, value] of Object.entries(overrides) as [EvalMetricName, number][]) metrics[metric] = { value, samples: 100 };
	const caseIds = smallCorpus().cases.map((item) => item.id);
	return { benchmarkVersion: "bench-v1", corpusVersion: "test-corpus-v1", generatedAt: "2026-09-12T00:00:00.000Z", observationCount: caseIds.length, caseIds, e2eObservedCaseIds: caseIds, e2ePassedCaseIds: caseIds, metrics };
}

export function components(version = "v1", fingerprint = "fp1"): ReleaseComponentManifest {
	return {
		prompt: { version, fingerprint }, normalizer: { version, fingerprint }, embedding: { version, fingerprint },
		index: { version, fingerprint }, rrf: { version, fingerprint }, reranker: { version, fingerprint }, toolSchema: { version, fingerprint },
	};
}
