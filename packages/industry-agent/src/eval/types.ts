import type { JsonObject } from "../contracts/index.ts";

export const EVAL_CATEGORIES = [
	"SAME_NAME_ENTITY",
	"ALIAS_SHORT_NAME",
	"TYPO",
	"CHAINAGE_RANGE",
	"SIDE",
	"PROJECT_CONFLICT",
	"SECTION_NAME",
	"BOQ_CODE",
	"CONTEXT_REFERENCE",
	"IMAGE_RESERVED",
	"RAG_SCOPE_ACL",
	"KNOWLEDGE_SCOPE_CONFLICT",
	"INSUFFICIENT_EVIDENCE",
	"WRONG_MUTATION_TARGET",
	"BATCH_MUTATION",
	"TOOL_FAILURE",
	"LLM_TIMEOUT",
	"ZERO_RETRIEVAL",
	"HARD_NEGATIVE",
] as const;
export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

export const EVAL_METRIC_NAMES = [
	"intentCandidateRecallAtK",
	"intentMacroF1",
	"mentionSpanF1",
	"normalizationExactMatch",
	"entityRecallAt20",
	"entityRecallAt50",
	"entityHitAt1",
	"entityMrr",
	"ragRecallAtK",
	"ragNdcgAtK",
	"ragMrr",
	"ragGroundedness",
	"citationAccuracy",
	"toolSelectionAccuracy",
	"mutationWrongTargetRate",
	"approvalConsistency",
	"traceSpanCompleteness",
	"tokenAccountingCompleteness",
	"endToEndTaskSuccess",
	"clarificationRate",
	"manualStepsSaved",
] as const;
export type EvalMetricName = (typeof EVAL_METRIC_NAMES)[number];

export interface GoldenEvalCase {
	id: string;
	category: EvalCategory;
	kind: "GOLDEN" | "HARD" | "HARD_NEGATIVE";
	input: JsonObject;
	expected: JsonObject;
	tags: readonly string[];
}

export interface GoldenCorpus {
	version: string;
	generatorVersion: string;
	cases: readonly GoldenEvalCase[];
}

export interface GoldenCorpusManifest {
	version: string;
	generatorVersion: string;
	caseCount: number;
	canonicalSha256: string;
	categories: Readonly<Record<EvalCategory, number>>;
}

export interface EvalSpan {
	start: number;
	end: number;
	label?: string;
}

export interface EvalObservation {
	caseId: string;
	intent?: {
		gold: string;
		candidates: readonly string[];
		predicted: string;
	};
	mentions?: {
		gold: readonly EvalSpan[];
		predicted: readonly EvalSpan[];
	};
	normalization?: {
		expected: unknown;
		actual: unknown;
	};
	entity?: {
		relevantIds: readonly string[];
		rankedIds: readonly string[];
	};
	rag?: {
		relevantChunkIds: readonly string[];
		rankedChunkIds: readonly string[];
		grounded: boolean;
		citationsCorrect: boolean;
	};
	tool?: {
		expectedTool: string;
		actualTool: string;
	};
	mutation?: {
		expectedTargetIds: readonly string[];
		actualTargetIds: readonly string[];
	};
	approval?: {
		expectedAllowed: boolean;
		actualAllowed: boolean;
		expectedDigest?: string;
		actualDigest?: string;
	};
	trace?: {
		requiredSpans: readonly string[];
		observedSpans: readonly string[];
	};
	tokens?: {
		expected: Readonly<Record<"llmCalls" | "inputTokens" | "outputTokens" | "cachedTokens" | "totalTokens", number>>;
		accounted: Readonly<Record<"llmCalls" | "inputTokens" | "outputTokens" | "cachedTokens" | "totalTokens", number>>;
	};
	e2e?: {
		success: boolean;
		clarified: boolean;
		manualStepsBaseline: number;
		manualStepsActual: number;
	};
}

export interface OfflineEvalExecutor {
	execute(testCase: GoldenEvalCase): Promise<EvalObservation>;
}

export interface OfflineBenchmarkOptions {
	benchmarkVersion: string;
	intentCandidateK: number;
	ragK: number;
	concurrency?: number;
	generatedAt?: string;
}

export interface MetricValue {
	value: number;
	samples: number;
}

export interface BenchmarkReport {
	benchmarkVersion: string;
	corpusVersion: string;
	generatedAt: string;
	observationCount: number;
	caseIds: readonly string[];
	e2eObservedCaseIds: readonly string[];
	e2ePassedCaseIds: readonly string[];
	metrics: Readonly<Partial<Record<EvalMetricName, MetricValue>>>;
}

export interface MetricGateRule {
	min?: number;
	minSamples?: number;
	max?: number;
	maxRegression?: number;
}

export interface ReleaseGateConfig {
	version: string;
	minCorpusCases: number;
	minCasesPerCategory: number;
	minBenchmarkCoverage: number;
	requiredCategories: readonly EvalCategory[];
	criticalE2ECaseIds: readonly string[];
	intentCandidateK: number;
	ragK: number;
	metricRules: Readonly<Partial<Record<EvalMetricName, MetricGateRule>>>;
}

export const RELEASE_COMPONENTS = [
	"prompt",
	"normalizer",
	"embedding",
	"index",
	"rrf",
	"reranker",
	"toolSchema",
] as const;
export type ReleaseComponentName = (typeof RELEASE_COMPONENTS)[number];

export interface VersionedArtifact {
	version: string;
	fingerprint: string;
}

export type ReleaseComponentManifest = Readonly<Record<ReleaseComponentName, VersionedArtifact>>;

export interface RegressionDiff {
	metric: EvalMetricName;
	baseline: number;
	candidate: number;
	qualityDelta: number;
	regressed: boolean;
}

export interface GateIssue {
	code:
		| "CORPUS_INVALID"
		| "METRIC_MISSING"
		| "METRIC_THRESHOLD"
		| "METRIC_REGRESSION"
		| "VERSION_BUMP_REQUIRED"
		| "CRITICAL_E2E_FAILED";
	message: string;
	metric?: EvalMetricName;
	component?: ReleaseComponentName;
}

export interface ReleaseGateInput {
	mode: "ESTABLISH_BASELINE" | "COMPARE";
	corpus: GoldenCorpus;
	corpusManifest: GoldenCorpusManifest;
	candidateReport: BenchmarkReport;
	candidateComponents: ReleaseComponentManifest;
	baselineReport?: BenchmarkReport;
	baselineComponents?: ReleaseComponentManifest;
}

export interface ReleaseGateDecision {
	status: "PASS" | "BLOCK";
	issues: readonly GateIssue[];
	regressionDiffs: readonly RegressionDiff[];
	changedComponents: readonly ReleaseComponentName[];
}
