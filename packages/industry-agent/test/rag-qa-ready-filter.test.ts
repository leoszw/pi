import { describe, expect, it } from "vitest";
import { RagQaService } from "../src/rag/qa/service.ts";
import { chunk, context, document, options } from "./rag-qa-helpers.ts";

describe("ready-only retrieval",()=>{it("never retrieves failed/staging documents",async()=>{
 const failed=document("bad",{status:"FAILED"}); const good=document("good");
 const result=await new RagQaService(options([{document:failed,chunk:chunk("bad-k","bad","桥梁 混凝土"),vector:[1,0]},{document:good,chunk:chunk("good-k","good","桥梁 混凝土"),vector:[1,0]}])).answer({context,question:"桥梁 混凝土"});
 expect(result.citations.map((c)=>c.documentId)).toEqual(["good"]);
});});
