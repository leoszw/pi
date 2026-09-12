import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 report generation", () => {
	it("renders Excel, PDF, chart and narrative with server-computed lineage", async () => {
		const harness = service();
		const result = await harness.service.generate(request(["EXCEL", "PDF", "CHART", "NARRATIVE"]));
		expect(result.artifacts).toHaveLength(4);
		expect(result.artifacts.every((item) => item.evidenceIds.includes("fact-1"))).toBe(true);
		expect(result.uiActions[0]?.type).toBe("report_preview");
	});
});
