import { describe, expect, it } from "vitest";
import { request, resolution, service, updateProposal } from "./image-input-helpers.ts";

describe("M9 image review boundaries", () => {
	it("returns entity picker and never prepares on ambiguity", async () => {
		const ambiguous = { ...resolution, matches: [], ambiguities: [{ ambiguityId: "a1", label: "桥墩", evidenceObservationIds: ["o2"], candidates: [{ candidate: { entityId: "E1", entityType: "ENGINEERING_POSITION", canonicalName: "1#墩", score: 0.8, source: "hybrid" }, scope: { tenantId: "t1", companyId: "c1", projectId: "p1" } }] }] };
		const { instance, preparer } = service({ entityResolution: ambiguous });
		const result = await instance.process(request());
		expect(result.status).toBe("NEEDS_ENTITY_REVIEW");
		expect(result.uiActions[0]?.type).toBe("entity_picker");
		expect(preparer.calls).toHaveLength(0);
	});

	it("returns missing-fields form without mutation prepare", async () => {
		const { instance, preparer } = service({ proposal: { ...updateProposal, values: {} } });
		const result = await instance.process(request());
		expect(result.status).toBe("NEEDS_FIELDS");
		expect(result.missingFields).toEqual(["owner"]);
		expect(result.uiActions[0]?.type).toBe("form");
		expect(preparer.calls).toHaveLength(0);
	});

	it("returns review UI for low confidence without mutation prepare", async () => {
		const { instance, preparer } = service({ proposal: { ...updateProposal, confidence: 0.6 } });
		const result = await instance.process(request());
		expect(result.status).toBe("NEEDS_REVIEW");
		expect(result.uiActions[0]?.type).toBe("editable_form");
		expect(preparer.calls).toHaveLength(0);
	});
});
