import { describe, expect, it } from "vitest";
import { request, renderer, service } from "./report-helpers.ts";

describe("M11 embedded artifact lineage", () => {
	it("requires the renderer to embed exactly the server-expected evidence set", async () => {
		const missing = renderer("EXCEL", { embeddedEvidenceIds: [] });
		await expect(service({ customRenderers: [missing] }).service.generate(request())).rejects.toMatchObject({ code: "REPORT_LINEAGE_INVALID" });
		const extra = renderer("EXCEL", { embeddedEvidenceIds: ["fact-1", "unexpected"] });
		await expect(service({ customRenderers: [extra] }).service.generate(request())).rejects.toMatchObject({ code: "REPORT_LINEAGE_INVALID" });
	});
});
