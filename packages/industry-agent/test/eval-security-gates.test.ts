import { describe, expect, it } from "vitest";
import { buildGoldenCorpusManifest, evaluateReleaseGate } from "../src/eval/index.ts";
import { components, fullReport, gateConfig, smallCorpus } from "./eval-helpers.ts";

describe("phase 11 safety gates", () => {
	it("uses zero tolerance for wrong mutation targets", () => {
		const decision = evaluateReleaseGate(
			{
				corpusManifest: buildGoldenCorpusManifest(smallCorpus()),
				mode: "ESTABLISH_BASELINE",
				corpus: smallCorpus(),
				candidateReport: fullReport({ mutationWrongTargetRate: 0.001 }),
				candidateComponents: components(),
			},
			gateConfig(),
		);
		expect(decision.status).toBe("BLOCK");
		expect(decision.issues.some((item) => item.metric === "mutationWrongTargetRate")).toBe(true);
	});

	it("requires perfect approval consistency", () => {
		const decision = evaluateReleaseGate(
			{
				corpusManifest: buildGoldenCorpusManifest(smallCorpus()),
				mode: "ESTABLISH_BASELINE",
				corpus: smallCorpus(),
				candidateReport: fullReport({ approvalConsistency: 0.999 }),
				candidateComponents: components(),
			},
			gateConfig(),
		);
		expect(decision.status).toBe("BLOCK");
	});
});
