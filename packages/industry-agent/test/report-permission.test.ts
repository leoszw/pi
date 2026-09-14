import { describe, expect, it } from "vitest";
import { renderer, request, service } from "./report-helpers.ts";

describe("M11 report permission", () => {
	it("authorizes before any renderer is called", async () => {
		const excel = renderer("EXCEL");
		const harness = service({ allowed: false, customRenderers: [excel] });
		await expect(harness.service.generate(request())).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED" });
		expect(excel.inputs).toHaveLength(0);
	});
});
