import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 report trace", () => {
	it("records report stages without raw artifact content", async () => {
		const harness = service();
		await harness.service.generate(request());
		expect(harness.trace.events.map((item) => item.stage)).toEqual([
			"AUTHORIZE",
			"AUTHORIZE",
			"VALIDATE",
			"VALIDATE",
			"RENDER_START",
			"RENDER_END",
			"COMPLETE",
		]);
		expect(JSON.stringify(harness.trace.events)).not.toContain("PK");
	});
});
