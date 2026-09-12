import { describe, expect, it } from "vitest";
import { request, service } from "./report-helpers.ts";

describe("M11 runtime enum validation", () => {
	it("rejects forged evidence and column kinds even when TypeScript is bypassed", async () => {
		const base = request();
		const badEvidence = { ...base, model: { ...base.model, evidence: [{ ...base.model.evidence[0]!, kind: "SYSTEM_SECRET" }] } };
		await expect(service().service.generate(badEvidence as typeof base)).rejects.toMatchObject({ code: "REPORT_LINEAGE_INVALID" });
		const badColumn = { ...base, model: { ...base.model, datasets: [{ ...base.model.datasets[0]!, columns: [{ key: "name", label: "名称", type: "HTML" }, { key: "quantity", label: "数量", type: "NUMBER" }] }] } };
		await expect(service().service.generate(badColumn as typeof base)).rejects.toMatchObject({ code: "REPORT_INVALID_REQUEST" });
	});
});
