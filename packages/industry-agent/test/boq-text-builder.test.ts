import { describe, expect, it } from "vitest";
import { BOQ_RETRIEVAL_CONFIG_V1 } from "../src/retrieval/boq/config.ts";
import { buildBoqSearchDocument } from "../src/retrieval/boq/text-builder.ts";

describe("BOQ text builder", () => {
	it("keeps specifications but excludes prices quantities and amounts from embedding text", () => {
		const doc = buildBoqSearchDocument({ row:{ ledgerId:"1",proId:"p",sectionId:"4",sectionName:"桥梁",ledgerCodeRaw:"403-2-a",ledgerCodeNorm:"403-2-a",ledgerNameRaw:"HRB400钢筋",ledgerNameNorm:"HRB400钢筋",unitRaw:"kg",unitNorm:"kg",isDeleted:false }, hierarchy:{ codeSegments:["403","2","a"],parentCode:"403-2",ancestorCodes:["403","403-2"],existingAncestorCodes:[],missingAncestorCodes:["403","403-2"],hierarchyGap:true,depth:3,hasChildren:false,isLeaf:true,pathNames:["HRB400钢筋"],pathText:"HRB400钢筋" }, aliases:[], config:BOQ_RETRIEVAL_CONFIG_V1 });
		expect(doc.embeddingItemText).toContain("HRB400");
		expect(doc.embeddingItemText.includes("contract_price")).toBe(false);
		expect(doc.embeddingContextText.includes("金额")).toBe(false);
	});
});
