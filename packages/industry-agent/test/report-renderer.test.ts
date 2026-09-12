import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 report renderer registry", () => {
	it("fails closed when a requested renderer is missing", async () => {
		const harness = service({ formats: ["EXCEL"] });
		await expect(harness.service.generate(request(["PDF"]))).rejects.toMatchObject({ code: "REPORT_RENDERER_NOT_FOUND" });
	});
});
