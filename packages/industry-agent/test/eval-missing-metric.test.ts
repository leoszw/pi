import { describe, expect, it } from "vitest";
import { buildGoldenCorpusManifest, evaluateReleaseGate } from "../src/eval/index.ts";
import { components, fullReport, gateConfig, smallCorpus } from "./eval-helpers.ts";

describe("phase 11 required metrics", () => {
	it("blocks promotion when a configured metric has no observations", () => {
		const report = fullReport();
		const metrics = { ...report.metrics };
		delete metrics.tokenAccountingCompleteness;
		const decision = evaluateReleaseGate(
			{
				corpusManifest: buildGoldenCorpusManifest(smallCorpus()),
				mode: "ESTABLISH_BASELINE",
				corpus: smallCorpus(),
				candidateReport: { ...report, metrics },
				candidateComponents: components(),
			},
			gateConfig(),
		);
		expect(decision.status).toBe("BLOCK");
		expect(
			decision.issues.some(
				(item) => item.code === "METRIC_MISSING" && item.metric === "tokenAccountingCompleteness",
			),
		).toBe(true);
	});
	it("blocks a metric with too few samples", () => {
		const config = gateConfig();
		const metricRules = {
			...config.metricRules,
			toolSelectionAccuracy: { min: 0.8, minSamples: 50, maxRegression: 0.02 },
		};
		const report = fullReport();
		const metrics = { ...report.metrics, toolSelectionAccuracy: { value: 1, samples: 1 } };
		const decision = evaluateReleaseGate(
			{
				corpusManifest: buildGoldenCorpusManifest(smallCorpus()),
				mode: "ESTABLISH_BASELINE",
				corpus: smallCorpus(),
				candidateReport: { ...report, metrics },
				candidateComponents: components(),
			},
			{ ...config, metricRules },
		);
		expect(decision.status).toBe("BLOCK");
		expect(
			decision.issues.some((item) => item.metric === "toolSelectionAccuracy" && item.message.includes("samples")),
		).toBe(true);
	});
});
