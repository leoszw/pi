import { describe, expect, it } from "vitest";
import { buildBoqHierarchyCatalog } from "../src/retrieval/boq/hierarchy.ts";

describe("BOQ hierarchy", () => {
	it("preserves structural ancestors but never invents missing parent names", () => {
		const catalog = buildBoqHierarchyCatalog([{ code: "203", name: "章" }, { code: "203-1-a-1", name: "子项" }]);
		const item = catalog.get("203-1-a-1")!;
		expect(item.ancestorCodes).toEqual(["203", "203-1", "203-1-a"]);
		expect(item.missingAncestorCodes).toEqual(["203-1", "203-1-a"]);
		expect(item.pathNames).toEqual(["章", "子项"]);
		expect(item.hierarchyGap).toBe(true);
	});
	it("computes leaf from descendants rather than unit", () => {
		const catalog = buildBoqHierarchyCatalog([{ code: "403", name: "钢筋" }, { code: "403-1", name: "基础钢筋" }]);
		expect(catalog.get("403")?.isLeaf).toBe(false);
		expect(catalog.get("403-1")?.isLeaf).toBe(true);
	});
});
