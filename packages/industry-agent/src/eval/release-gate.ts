import { validateGoldenCorpus, validateGoldenCorpusManifest } from "./corpus.ts";
import { regressionDiffs } from "./regression.ts";
import {
	RELEASE_COMPONENTS,
	type BenchmarkReport,
	type EvalMetricName,
	type GateIssue,
	type ReleaseComponentName,
	type ReleaseGateConfig,
	type ReleaseGateDecision,
	type ReleaseGateInput,
	type VersionedArtifact,
} from "./types.ts";

function artifactChanged(before: VersionedArtifact, after: VersionedArtifact): boolean {
	return before.fingerprint !== after.fingerprint;
}

function collectChangedComponents(input: ReleaseGateInput, issues: GateIssue[]): readonly ReleaseComponentName[] {
	if (input.mode !== "COMPARE" || !input.baselineComponents) return [];
	const changed: ReleaseComponentName[] = [];
	for (const component of RELEASE_COMPONENTS) {
		const before = input.baselineComponents[component];
		const after = input.candidateComponents[component];
		if (!artifactChanged(before, after)) continue;
		changed.push(component);
		if (before.version === after.version) issues.push({ code: "VERSION_BUMP_REQUIRED", component, message: `${component} fingerprint changed without a version bump (${after.version})` });
	}
	return changed;
}

function validateReportCoverage(report: BenchmarkReport, corpusIds: ReadonlySet<string>, minCoverage: number, label: string, issues: GateIssue[]): void {
	const observedIds = new Set(report.caseIds);
	const unknown = [...observedIds].filter((id) => !corpusIds.has(id));
	const coverage = corpusIds.size === 0 ? 0 : [...corpusIds].filter((id) => observedIds.has(id)).length / corpusIds.size;
	if (unknown.length) issues.push({ code: "CORPUS_INVALID", message: `${label} benchmark contains ${unknown.length} case ids that are not in the gated corpus` });
	if (coverage < minCoverage) issues.push({ code: "CORPUS_INVALID", message: `${label} benchmark coverage ${coverage.toFixed(4)} is below required ${minCoverage}` });
	if (report.observationCount !== report.caseIds.length) issues.push({ code: "CORPUS_INVALID", message: `${label} benchmark observationCount does not match caseIds length` });
	if (observedIds.size !== report.caseIds.length) issues.push({ code: "CORPUS_INVALID", message: `${label} benchmark caseIds contain duplicates` });
}

function validateMetricSamples(report: BenchmarkReport, config: ReleaseGateConfig, label: string, issues: GateIssue[], enforceThresholds: boolean): void {
	for (const [metric, rule] of Object.entries(config.metricRules) as [EvalMetricName, NonNullable<ReleaseGateConfig["metricRules"][EvalMetricName]>][]) {
		const result = report.metrics[metric];
		if (!result || result.samples <= 0) { issues.push({ code: "METRIC_MISSING", metric, message: `${label} required metric ${metric} is missing` }); continue; }
		if (rule.minSamples !== undefined && result.samples < rule.minSamples) issues.push({ code: "METRIC_MISSING", metric, message: `${label} ${metric} has ${result.samples} samples; at least ${rule.minSamples} are required` });
		if (!enforceThresholds) continue;
		if (rule.min !== undefined && result.value < rule.min) issues.push({ code: "METRIC_THRESHOLD", metric, message: `${metric}=${result.value} is below minimum ${rule.min}` });
		if (rule.max !== undefined && result.value > rule.max) issues.push({ code: "METRIC_THRESHOLD", metric, message: `${metric}=${result.value} exceeds maximum ${rule.max}` });
	}
}

export function evaluateReleaseGate(input: ReleaseGateInput, config: ReleaseGateConfig): ReleaseGateDecision {
	const issues: GateIssue[] = [];
	for (const message of validateGoldenCorpusManifest(input.corpus, input.corpusManifest)) issues.push({ code: "CORPUS_INVALID", message });
	const corpus = validateGoldenCorpus(input.corpus, config.minCorpusCases, config.minCasesPerCategory);
	for (const issue of corpus.issues) issues.push({ code: "CORPUS_INVALID", message: issue.message });
	for (const category of config.requiredCategories) {
		if ((corpus.categoryCounts[category] ?? 0) < config.minCasesPerCategory) issues.push({ code: "CORPUS_INVALID", message: `Required category ${category} does not meet minimum coverage` });
	}
	if (input.candidateReport.corpusVersion !== input.corpus.version) issues.push({ code: "CORPUS_INVALID", message: `Benchmark corpus version ${input.candidateReport.corpusVersion} does not match ${input.corpus.version}` });
	const corpusIds = new Set(input.corpus.cases.map((item) => item.id));
	validateReportCoverage(input.candidateReport, corpusIds, config.minBenchmarkCoverage, "Candidate", issues);
	const e2eObserved = new Set(input.candidateReport.e2eObservedCaseIds);
	const e2ePassed = new Set(input.candidateReport.e2ePassedCaseIds);
	for (const caseId of config.criticalE2ECaseIds) {
		if (!corpusIds.has(caseId)) issues.push({ code: "CORPUS_INVALID", message: `Critical E2E case ${caseId} is not present in corpus` });
		else if (!e2eObserved.has(caseId)) issues.push({ code: "CRITICAL_E2E_FAILED", message: `Critical E2E case ${caseId} has no E2E observation` });
		else if (!e2ePassed.has(caseId)) issues.push({ code: "CRITICAL_E2E_FAILED", message: `Critical E2E case ${caseId} failed` });
	}
	validateMetricSamples(input.candidateReport, config, "Candidate", issues, true);
	const changedComponents = collectChangedComponents(input, issues);
	let diffs: ReturnType<typeof regressionDiffs> = [];
	if (input.mode === "COMPARE") {
		if (!input.baselineReport || !input.baselineComponents) {
			issues.push({ code: "METRIC_MISSING", message: "COMPARE mode requires baseline report and component manifest" });
		} else {
			if (input.baselineReport.corpusVersion !== input.candidateReport.corpusVersion) issues.push({ code: "CORPUS_INVALID", message: "Baseline and candidate benchmark reports must use the same corpus version" });
			validateReportCoverage(input.baselineReport, corpusIds, config.minBenchmarkCoverage, "Baseline", issues);
			validateMetricSamples(input.baselineReport, config, "Baseline", issues, false);
			diffs = regressionDiffs(input.baselineReport, input.candidateReport, config);
			for (const diff of diffs) if (diff.regressed) issues.push({ code: "METRIC_REGRESSION", metric: diff.metric, message: `${diff.metric} regressed from ${diff.baseline} to ${diff.candidate}` });
		}
	}
	return { status: issues.length ? "BLOCK" : "PASS", issues, regressionDiffs: diffs, changedComponents };
}
