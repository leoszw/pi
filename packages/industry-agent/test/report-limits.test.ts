import { describe, expect, it } from "vitest";
import { renderer, request, service } from "./report-helpers.ts";

describe("M11 report limits", () => {
	it("rejects oversized individual and total artifacts", async () => {
		const excel = renderer("EXCEL", { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(20).fill(1)]) });
		const harness = service({ customRenderers: [excel], customLimits: { maxArtifactBytes: 10 } });
		await expect(harness.service.generate(request())).rejects.toMatchObject({ code: "REPORT_LIMIT_EXCEEDED" });
	});

	it("rejects a multi-format report when the combined artifact size exceeds the total limit", async () => {
		const excel = renderer("EXCEL", { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(16).fill(1)]) });
		const pdf = renderer("PDF", { content: new TextEncoder().encode("%PDF-1.7\n12345678901234567890\n%%EOF") });
		const harness = service({
			customRenderers: [excel, pdf],
			customLimits: { maxArtifactBytes: 40, maxTotalArtifactBytes: 50 },
		});
		await expect(harness.service.generate(request(["EXCEL", "PDF"]))).rejects.toMatchObject({
			code: "REPORT_LIMIT_EXCEEDED",
		});
	});
});
