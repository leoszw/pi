import {
	type BenchmarkReport,
	EVAL_METRIC_NAMES,
	type EvalMetricName,
	type EvalObservation,
	type EvalSpan,
	type MetricValue,
} from "./types.ts";

function average(values: readonly number[]): MetricValue | undefined {
	if (!values.length) return undefined;
	return { value: values.reduce((sum, value) => sum + value, 0) / values.length, samples: values.length };
}

function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	if (value && typeof value === "object") {
		const object = value as Readonly<Record<string, unknown>>;
		return `{${Object.keys(object)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function exactSpanKey(span: EvalSpan): string {
	return `${span.start}:${span.end}:${span.label ?? ""}`;
}

function setEqual(left: readonly string[], right: readonly string[]): boolean {
	const a = new Set(left);
	const b = new Set(right);
	return a.size === b.size && [...a].every((value) => b.has(value));
}

function reciprocalRank(relevant: ReadonlySet<string>, ranked: readonly string[]): number {
	const index = ranked.findIndex((id) => relevant.has(id));
	return index < 0 ? 0 : 1 / (index + 1);
}

function recallAt(relevantIds: readonly string[], rankedIds: readonly string[], k: number): number | undefined {
	const relevant = new Set(relevantIds);
	if (!relevant.size) return undefined;
	const hits = new Set(rankedIds.slice(0, k).filter((id) => relevant.has(id)));
	return hits.size / relevant.size;
}

function ndcgAt(relevantIds: readonly string[], rankedIds: readonly string[], k: number): number | undefined {
	const relevant = new Set(relevantIds);
	if (!relevant.size) return undefined;
	const seen = new Set<string>();
	const dcg = rankedIds.slice(0, k).reduce((sum, id, index) => {
		if (seen.has(id)) return sum;
		seen.add(id);
		return sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0);
	}, 0);
	const idealHits = Math.min(relevant.size, k);
	let idcg = 0;
	for (let index = 0; index < idealHits; index += 1) idcg += 1 / Math.log2(index + 2);
	return idcg === 0 ? 0 : dcg / idcg;
}

function macroF1(observations: readonly EvalObservation[]): MetricValue | undefined {
	const rows = observations.flatMap((item) =>
		item.intent ? [{ gold: item.intent.gold, predicted: item.intent.predicted }] : [],
	);
	if (!rows.length) return undefined;
	const labels = new Set(rows.flatMap((row) => [row.gold, row.predicted]));
	const scores: number[] = [];
	for (const label of labels) {
		let tp = 0;
		let fp = 0;
		let fn = 0;
		for (const row of rows) {
			if (row.gold === label && row.predicted === label) tp += 1;
			else if (row.gold !== label && row.predicted === label) fp += 1;
			else if (row.gold === label && row.predicted !== label) fn += 1;
		}
		const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
		const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
		scores.push(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall));
	}
	return { value: scores.reduce((sum, score) => sum + score, 0) / scores.length, samples: rows.length };
}

function mentionF1(observations: readonly EvalObservation[]): MetricValue | undefined {
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let samples = 0;
	for (const observation of observations) {
		if (!observation.mentions) continue;
		samples += 1;
		const gold = new Set(observation.mentions.gold.map(exactSpanKey));
		const predicted = new Set(observation.mentions.predicted.map(exactSpanKey));
		for (const key of predicted) {
			if (gold.has(key)) tp += 1;
			else fp += 1;
		}
		for (const key of gold) if (!predicted.has(key)) fn += 1;
	}
	if (!samples) return undefined;
	const precision = tp + fp === 0 ? (fn === 0 ? 1 : 0) : tp / (tp + fp);
	const recall = tp + fn === 0 ? (fp === 0 ? 1 : 0) : tp / (tp + fn);
	return { value: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall), samples };
}

export function computeBenchmarkReport(
	observations: readonly EvalObservation[],
	options: {
		benchmarkVersion: string;
		corpusVersion: string;
		intentCandidateK: number;
		ragK: number;
		generatedAt?: string;
	},
): BenchmarkReport {
	const values: Partial<Record<EvalMetricName, MetricValue>> = {};
	const put = (name: EvalMetricName, metric: MetricValue | undefined) => {
		if (metric) values[name] = metric;
	};
	put(
		"intentCandidateRecallAtK",
		average(
			observations.flatMap((item) =>
				item.intent
					? [item.intent.candidates.slice(0, options.intentCandidateK).includes(item.intent.gold) ? 1 : 0]
					: [],
			),
		),
	);
	put("intentMacroF1", macroF1(observations));
	put("mentionSpanF1", mentionF1(observations));
	put(
		"normalizationExactMatch",
		average(
			observations.flatMap((item) =>
				item.normalization
					? [stable(item.normalization.expected) === stable(item.normalization.actual) ? 1 : 0]
					: [],
			),
		),
	);
	put(
		"entityRecallAt20",
		average(
			observations.flatMap((item) =>
				item.entity
					? [recallAt(item.entity.relevantIds, item.entity.rankedIds, 20)].filter(
							(value): value is number => value !== undefined,
						)
					: [],
			),
		),
	);
	put(
		"entityRecallAt50",
		average(
			observations.flatMap((item) =>
				item.entity
					? [recallAt(item.entity.relevantIds, item.entity.rankedIds, 50)].filter(
							(value): value is number => value !== undefined,
						)
					: [],
			),
		),
	);
	put(
		"entityHitAt1",
		average(
			observations.flatMap((item) =>
				item.entity?.relevantIds.length
					? [item.entity.relevantIds.includes(item.entity.rankedIds[0] ?? "") ? 1 : 0]
					: [],
			),
		),
	);
	put(
		"entityMrr",
		average(
			observations.flatMap((item) =>
				item.entity?.relevantIds.length
					? [reciprocalRank(new Set(item.entity.relevantIds), item.entity.rankedIds)]
					: [],
			),
		),
	);
	put(
		"ragRecallAtK",
		average(
			observations.flatMap((item) =>
				item.rag
					? [recallAt(item.rag.relevantChunkIds, item.rag.rankedChunkIds, options.ragK)].filter(
							(value): value is number => value !== undefined,
						)
					: [],
			),
		),
	);
	put(
		"ragNdcgAtK",
		average(
			observations.flatMap((item) =>
				item.rag
					? [ndcgAt(item.rag.relevantChunkIds, item.rag.rankedChunkIds, options.ragK)].filter(
							(value): value is number => value !== undefined,
						)
					: [],
			),
		),
	);
	put(
		"ragMrr",
		average(
			observations.flatMap((item) =>
				item.rag?.relevantChunkIds.length
					? [reciprocalRank(new Set(item.rag.relevantChunkIds), item.rag.rankedChunkIds)]
					: [],
			),
		),
	);
	put("ragGroundedness", average(observations.flatMap((item) => (item.rag ? [item.rag.grounded ? 1 : 0] : []))));
	put(
		"citationAccuracy",
		average(observations.flatMap((item) => (item.rag ? [item.rag.citationsCorrect ? 1 : 0] : []))),
	);
	put(
		"toolSelectionAccuracy",
		average(
			observations.flatMap((item) => (item.tool ? [item.tool.expectedTool === item.tool.actualTool ? 1 : 0] : [])),
		),
	);
	put(
		"mutationWrongTargetRate",
		average(
			observations.flatMap((item) =>
				item.mutation ? [setEqual(item.mutation.expectedTargetIds, item.mutation.actualTargetIds) ? 0 : 1] : [],
			),
		),
	);
	put(
		"approvalConsistency",
		average(
			observations.flatMap((item) => {
				if (!item.approval) return [];
				const decisionMatches = item.approval.expectedAllowed === item.approval.actualAllowed;
				const digestMatches =
					!item.approval.expectedAllowed || item.approval.expectedDigest === item.approval.actualDigest;
				return [decisionMatches && digestMatches ? 1 : 0];
			}),
		),
	);
	put(
		"traceSpanCompleteness",
		average(
			observations.flatMap((item) => {
				if (!item.trace) return [];
				const required = new Set(item.trace.requiredSpans);
				if (!required.size) return [1];
				const observed = new Set(item.trace.observedSpans);
				return [[...required].filter((span) => observed.has(span)).length / required.size];
			}),
		),
	);
	put(
		"tokenAccountingCompleteness",
		average(
			observations.flatMap((item) => {
				if (!item.tokens) return [];
				const keys = ["llmCalls", "inputTokens", "outputTokens", "cachedTokens", "totalTokens"] as const;
				return [
					keys.filter((key) => item.tokens?.expected[key] === item.tokens?.accounted[key]).length / keys.length,
				];
			}),
		),
	);
	put("endToEndTaskSuccess", average(observations.flatMap((item) => (item.e2e ? [item.e2e.success ? 1 : 0] : []))));
	put("clarificationRate", average(observations.flatMap((item) => (item.e2e ? [item.e2e.clarified ? 1 : 0] : []))));
	put(
		"manualStepsSaved",
		average(
			observations.flatMap((item) => (item.e2e ? [item.e2e.manualStepsBaseline - item.e2e.manualStepsActual] : [])),
		),
	);
	const ordered: Partial<Record<EvalMetricName, MetricValue>> = {};
	for (const name of EVAL_METRIC_NAMES) if (values[name]) ordered[name] = values[name];
	return {
		benchmarkVersion: options.benchmarkVersion,
		corpusVersion: options.corpusVersion,
		generatedAt: options.generatedAt ?? new Date().toISOString(),
		observationCount: observations.length,
		caseIds: observations.map((item) => item.caseId),
		e2eObservedCaseIds: observations.filter((item) => item.e2e !== undefined).map((item) => item.caseId),
		e2ePassedCaseIds: observations.filter((item) => item.e2e?.success === true).map((item) => item.caseId),
		metrics: ordered,
	};
}
