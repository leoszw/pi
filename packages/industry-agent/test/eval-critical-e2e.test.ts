import { describe, expect, it } from "vitest";
import { buildGoldenCorpusManifest, evaluateReleaseGate } from "../src/eval/index.ts";
import { components, fullReport, gateConfig, smallCorpus } from "./eval-helpers.ts";

describe("phase 11 critical E2E gate", () => {
	it("blocks when a required critical workflow fails even if aggregate E2E is high", () => {
		const corpus = smallCorpus();
		const criticalId = corpus.cases[0]!.id;
		const config = { ...gateConfig(), criticalE2ECaseIds: [criticalId] };
		const report = fullReport();
		const decision = evaluateReleaseGate(
			{
				corpus,
				corpusManifest: buildGoldenCorpusManifest(corpus),
				mode: "ESTABLISH_BASELINE",
				candidateReport: { ...report, e2ePassedCaseIds: report.e2ePassedCaseIds.filter((id) => id !== criticalId) },
				candidateComponents: components(),
			},
			config,
		);
		expect(decision.status).toBe("BLOCK");
		expect(decision.issues.some((item) => item.code === "CRITICAL_E2E_FAILED")).toBe(true);
	});
});
