import { describe, expect, it } from "vitest";
import { buildGoldenCorpusManifest, evaluateReleaseGate } from "../src/eval/index.ts";
import { components, fullReport, gateConfig, smallCorpus } from "./eval-helpers.ts";

describe("phase 11 release gate", () => {
	it("passes an initial baseline only when corpus and thresholds pass", () => {
		const decision = evaluateReleaseGate({ corpusManifest: buildGoldenCorpusManifest(smallCorpus()), mode: "ESTABLISH_BASELINE", corpus: smallCorpus(), candidateReport: fullReport(), candidateComponents: components() }, gateConfig());
		expect(decision.status).toBe("PASS");
	});

	it("requires a version bump when a gated component fingerprint changes", () => {
		const baseline = components("v1", "fp1");
		const candidate = { ...baseline, prompt: { version: "v1", fingerprint: "fp2" } };
		const decision = evaluateReleaseGate({ corpusManifest: buildGoldenCorpusManifest(smallCorpus()), mode: "COMPARE", corpus: smallCorpus(), candidateReport: fullReport(), candidateComponents: candidate, baselineReport: fullReport(), baselineComponents: baseline }, gateConfig());
		expect(decision.status).toBe("BLOCK");
		expect(decision.issues.some((item) => item.code === "VERSION_BUMP_REQUIRED" && item.component === "prompt")).toBe(true);
	});

	it("blocks a regression even when the component version was bumped", () => {
		const baseline = components("v1", "fp1");
		const candidate = { ...baseline, reranker: { version: "v2", fingerprint: "fp2" } };
		const decision = evaluateReleaseGate({ corpusManifest: buildGoldenCorpusManifest(smallCorpus()), mode: "COMPARE", corpus: smallCorpus(), candidateReport: fullReport({ ragNdcgAtK: 0.90 }), candidateComponents: candidate, baselineReport: fullReport({ ragNdcgAtK: 0.99 }), baselineComponents: baseline }, gateConfig());
		expect(decision.status).toBe("BLOCK");
		expect(decision.issues.some((item) => item.code === "METRIC_REGRESSION" && item.metric === "ragNdcgAtK")).toBe(true);
	});
});
