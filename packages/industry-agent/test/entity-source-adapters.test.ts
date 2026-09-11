import { describe, expect, it } from "vitest";
import { boqSourceToEntity, engineeringPositionToEntity } from "../src/entity/source-adapters.ts";

const versions = {
	sourceSystem: "mysql",
	sourceVersion: "2026-09-11T00:00:00Z",
	indexVersion: "v1",
	now: () => new Date("2026-09-11T00:00:00.000Z"),
};

describe("entity source adapters", () => {
	it("maps normalized engineering position data without quantity facts", () => {
		const entity = engineeringPositionToEntity(
			{
				engineeringId: "90071992547409931234",
				engineeringCode: "ENG-001",
				proId: "project-1",
				engineeringName: "初支仰拱",
				engineeringFullName: "荟萃山隧道右线 > 初支 > 初支仰拱",
				engineeringCategoryName: "隧道工程",
				engineeringTypeName: "初期支护",
				alignmentCode: "K",
				chainageStartM: 12395,
				chainageEndM: 12401,
				isMinUnit: true,
				isDeleted: false,
			},
			{ tenantId: "tenant-1", companyId: "company-1" },
			versions,
		);
		expect(entity.entityId).toBe("90071992547409931234");
		expect(entity.scope.projectId).toBe("project-1");
		expect(entity.attributes).not.toHaveProperty("designQuantity");
	});

	it("maps BOQ identity fields without price/quantity/amount facts", () => {
		const entity = boqSourceToEntity(
			{
				ledgerId: "123456789012345678",
				proId: "project-1",
				sectionId: "403",
				sectionName: "桥梁、涵洞",
				ledgerCodeRaw: "403-2-a",
				ledgerCodeNorm: "403-2-A",
				ledgerNameRaw: "带肋钢筋(HRB400)",
				ledgerNameNorm: "带肋钢筋(HRB400)",
				unitRaw: "kg",
				unitNorm: "kg",
				isDeleted: false,
			},
			{ tenantId: "tenant-1" },
			versions,
		);
		expect(entity.entityType).toBe("BOQ_ITEM");
		expect(entity.entityCode).toBe("403-2-A");
		expect(entity.attributes).not.toHaveProperty("contractPrice");
	});
});
