import { describe, expect, it } from "vitest";
import { OpenSearchBoqRetrievalBackend } from "../src/retrieval/boq/opensearch-backend.ts";
import { parseBoqQuery, buildBoqFilters } from "../src/retrieval/boq/query-parser.ts";

describe("OpenSearch BOQ backend", () => {
	it("builds project-scoped code exact query", async () => {
		let body: Readonly<Record<string, unknown>> = {};
		const backend=new OpenSearchBoqRetrievalBackend({indexName:"boq_ledger_v1",transport:{async search(_index,input){body=input;return {hits:{hits:[]}}}}});
		const parsed=parseBoqQuery({query:"403-2-a",projectId:"670701177435987968",catalog:{knownCodes:new Set(["403-2-a"]),knownAncestorCodes:new Set()}});
		await backend.searchExactCode(parsed,buildBoqFilters(parsed));
		expect(JSON.stringify(body)).toContain("670701177435987968");
		expect(JSON.stringify(body)).toContain("403-2-a");
	});
	it("uses ef_search for dense arms", async () => {
		let body: Readonly<Record<string, unknown>> = {};
		const backend=new OpenSearchBoqRetrievalBackend({indexName:"boq_ledger_v1",efSearch:160,transport:{async search(_index,input){body=input;return {hits:{hits:[]}}}}});
		await backend.searchDense("item_vector",[0,1],{excludeDeleted:true,projectId:"p"},80);
		expect(JSON.stringify(body)).toContain("ef_search"); expect(JSON.stringify(body)).toContain("160");
	});
});
