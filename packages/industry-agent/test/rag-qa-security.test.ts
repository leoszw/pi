import { describe, expect, it, vi } from "vitest";
import { RagQaService } from "../src/rag/qa/service.ts";
import { chunk, context, document, options, scope } from "./rag-qa-helpers.ts";

describe("rag qa backend security contract",()=>{it("rejects unauthorized candidates before rerank or answer",async()=>{
 const badScope={...scope,projectId:"p2"}; const badDoc=document("bad",{scope:badScope}); const badChunk=chunk("bad-k","bad","桥梁 混凝土",{scope:badScope});
 const rerank=vi.fn(async()=>[]); const generate=vi.fn(async()=>"bad");
 const base=options(); const service=new RagQaService({...base,retrieval:{async bm25(){return [{chunk:badChunk,document:badDoc,score:1,arm:"BM25" as const}]},async dense(){return []}},reranker:{version:"rr",rerank},answerGenerator:{generate}});
 await expect(service.answer({context,question:"桥梁"})).rejects.toMatchObject({code:"RAG_QA_ACCESS_DENIED"});
 expect(rerank).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
});});
