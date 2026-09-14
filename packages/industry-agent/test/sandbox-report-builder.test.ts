import { describe, expect, it } from "vitest";
import type { ReportGenerationRequest } from "../src/report/types.ts";
import { SandboxReportServiceBuilder } from "../src/sandbox/report-builder.ts";
import {
	sandboxBrokerResult,
	sandboxContext,
	sandboxOutput,
	sandboxProgram,
	sandboxReportResult,
} from "./sandbox-helpers.ts";

describe("M12 to M11 report bridge", () => {
	it("preserves authoritative broker evidence and derived lineage", async () => {
		let captured: ReportGenerationRequest | undefined;
		const builder = new SandboxReportServiceBuilder({
			generate: async (request) => {
				captured = request;
				return sandboxReportResult();
			},
		});
		await builder.build({
			context: sandboxContext(),
			goal: "Analyze quantity",
			reportTitle: "Quantity report",
			formats: ["NARRATIVE"],
			program: sandboxProgram(),
			output: sandboxOutput(),
			brokerResults: [sandboxBrokerResult()],
			runtimeVersion: "sandbox-runtime-v1",
			verificationSummary: "Verified",
		});
		expect(captured).toBeDefined();
		const model = captured!.model;
		expect(model.evidence.some((item) => item.sourceId.startsWith("read-only-broker:"))).toBe(true);
		expect(model.evidence.some((item) => item.kind === "DERIVED" && (item.parentEvidenceIds?.length ?? 0) > 0)).toBe(
			true,
		);
	});
});
