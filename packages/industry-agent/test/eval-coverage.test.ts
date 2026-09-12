import { describe, expect, it } from "vitest";
import { buildGoldenCorpusManifest, evaluateReleaseGate } from "../src/eval/index.ts";
import { components, fullReport, gateConfig, smallCorpus } from "./eval-helpers.ts";

describe("phase 11 benchmark coverage", () => {
	it("blocks a benchmark that did not execute the whole gated corpus", () => {
		const report = fullReport();
		const partial = { ...report, observationCount: 1, caseIds: [report.caseIds[0]!] };
		const decision = evaluateReleaseGate({ corpusManifest: buildGoldenCorpusManifest(smallCorpus()), mode: "ESTABLISH_BASELINE", corpus: smallCorpus(), candidateReport: partial, candidateComponents: components() }, gateConfig());
		expect(decision.status).toBe("BLOCK");
		expect(decision.issues.some((item) => item.code === "CORPUS_INVALID" && item.message.includes("coverage"))).toBe(true);
	});
});
