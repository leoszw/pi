import { describe, expect, it } from "vitest";
import { renderer, request, service } from "./report-helpers.ts";

describe("M11 artifact signature and file name", () => {
	it("rejects mismatched binary signatures and unsafe file names", async () => {
		const badPdf = renderer("PDF", { content: new TextEncoder().encode("not-a-pdf") });
		await expect(service({ customRenderers: [badPdf] }).service.generate(request(["PDF"]))).rejects.toMatchObject({
			code: "REPORT_ARTIFACT_INVALID",
		});
		const badName = renderer("EXCEL", { fileName: "../secret.xlsx" });
		await expect(service({ customRenderers: [badName] }).service.generate(request())).rejects.toMatchObject({
			code: "REPORT_ARTIFACT_INVALID",
		});
	});
});
