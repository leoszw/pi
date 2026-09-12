import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 evidence lineage graph", () => {
	it("rejects cycles in derived evidence", async () => {
		const base = request();
		const scope = { tenantId: "tenant-1", companyId: "company-1", projectId: "project-1" };
		const cyclic = {
			...base,
			model: {
				...base.model,
				evidence: [
					{ evidenceId: "a", kind: "DERIVED" as const, scope, sourceId: "derive:a", sourceVersion: "v1", parentEvidenceIds: ["b"] },
					{ evidenceId: "b", kind: "DERIVED" as const, scope, sourceId: "derive:b", sourceVersion: "v1", parentEvidenceIds: ["a"] },
				],
				datasets: [{ ...base.model.datasets[0]!, evidenceIds: ["a"] }], charts: [], narrative: [],
			},
		};
		await expect(service().service.generate(cyclic)).rejects.toMatchObject({ code: "REPORT_LINEAGE_INVALID" });
	});
});
