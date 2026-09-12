import { computeBenchmarkReport } from "./metrics.ts";
import type { BenchmarkReport, EvalObservation, GoldenCorpus, OfflineBenchmarkOptions, OfflineEvalExecutor } from "./types.ts";

export async function runOfflineBenchmark(
	corpus: GoldenCorpus,
	executor: OfflineEvalExecutor,
	options: OfflineBenchmarkOptions,
): Promise<BenchmarkReport> {
	const concurrency = options.concurrency ?? 1;
	if (!Number.isInteger(concurrency) || concurrency <= 0) throw new Error("Offline benchmark concurrency must be a positive integer");
	const observations = new Array<EvalObservation>(corpus.cases.length);
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const index = cursor;
			cursor += 1;
			const testCase = corpus.cases[index];
			if (!testCase) return;
			const observation = await executor.execute(testCase);
			if (observation.caseId !== testCase.id) throw new Error(`Executor returned caseId ${observation.caseId} for ${testCase.id}`);
			observations[index] = observation;
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, corpus.cases.length)) }, () => worker()));
	if (observations.some((item) => item === undefined)) throw new Error("Offline benchmark did not produce an observation for every corpus case");
	return computeBenchmarkReport(observations, {
		benchmarkVersion: options.benchmarkVersion,
		corpusVersion: corpus.version,
		intentCandidateK: options.intentCandidateK,
		ragK: options.ragK,
		...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
	});
}
