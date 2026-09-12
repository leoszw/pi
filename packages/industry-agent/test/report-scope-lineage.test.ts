import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 report scope and lineage", () => {
	it("rejects cross-project datasets and RAG citations without source coordinates", async () => {
		const harness = service();
		const scoped = request();
		const badScope = { ...scoped, model: { ...scoped.model, datasets: [{ ...scoped.model.datasets[0]!, scope: { tenantId: "tenant-1", companyId: "company-1", projectId: "project-2" } }] } };
		await expect(harness.service.generate(badScope)).rejects.toMatchObject({ code: "REPORT_SCOPE_MISMATCH" });
		const rag = request();
		const badRag = { ...rag, model: { ...rag.model, evidence: [{ ...rag.model.evidence[0]!, kind: "RAG_CITATION" as const }] } };
		await expect(harness.service.generate(badRag)).rejects.toMatchObject({ code: "REPORT_LINEAGE_INVALID" });
	});

	it("rejects derived evidence without a valid parent", async () => {
		const harness = service(); const base = request();
		const bad = { ...base, model: { ...base.model, evidence: [{ ...base.model.evidence[0]!, evidenceId: "derived", kind: "DERIVED" as const, parentEvidenceIds: ["missing"] }], datasets: [{ ...base.model.datasets[0]!, evidenceIds: ["derived"] }], charts: [], narrative: [] } };
		await expect(harness.service.generate(bad)).rejects.toMatchObject({ code: "REPORT_LINEAGE_INVALID" });
	});
});
