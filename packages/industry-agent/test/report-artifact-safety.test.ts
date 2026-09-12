import { describe, expect, it } from "vitest";
import { request, renderer, service } from "./report-helpers.ts";

describe("M11 report artifact safety", () => {
	it("rejects formulas, links, remote resources, executable content and raw html", async () => {
		for (const unsafe of [{ hasFormulas: true }, { hasExternalLinks: true }, { hasRemoteResources: true }, { hasExecutableContent: true }, { hasRawHtml: true }]) {
			const excel = renderer("EXCEL", unsafe); const harness = service({ customRenderers: [excel] });
			await expect(harness.service.generate(request())).rejects.toMatchObject({ code: "REPORT_ARTIFACT_INVALID" });
		}
	});
});
