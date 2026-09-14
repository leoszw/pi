import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 report data shape", () => {
	it("rejects undeclared row fields so hidden data cannot leak into exports", async () => {
		const harness = service();
		const base = request();
		const bad = {
			...base,
			model: {
				...base.model,
				datasets: [{ ...base.model.datasets[0]!, rows: [{ name: "A", quantity: 10, secretPrice: 999 }] }],
			},
		};
		await expect(harness.service.generate(bad)).rejects.toMatchObject({ code: "REPORT_INVALID_REQUEST" });
	});

	it("requires chart columns and evidence to belong to the referenced dataset", async () => {
		const harness = service();
		const base = request(["CHART"]);
		const bad = {
			...base,
			model: { ...base.model, charts: [{ ...base.model.charts[0]!, valueColumns: ["unknown"] }] },
		};
		await expect(harness.service.generate(bad)).rejects.toMatchObject({ code: "REPORT_INVALID_REQUEST" });
	});
});
