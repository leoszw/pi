import { describe, expect, it } from "vitest";
import { assertRagTransition, validateRagScope } from "../src/rag/ingestion/index.ts";
import { ragTestContext, ragTestScope } from "./rag-ingestion-helpers.ts";
describe("rag scope and state",()=>{
	it("keeps all scope/ACL dimensions and rejects project conflicts",()=>{ expect(validateRagScope(ragTestContext,ragTestScope)).toEqual(ragTestScope); expect(()=>validateRagScope(ragTestContext,{...ragTestScope,projectId:"other"})).toThrow(); });
	it("only permits valid state transitions",()=>{ assertRagTransition("RECEIVED","VALIDATING"); expect(()=>assertRagTransition("READY","INDEXING")).toThrow(); });
});
