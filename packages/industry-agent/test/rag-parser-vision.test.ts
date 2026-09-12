import { describe, expect, it } from "vitest";
import { StaticRagParserRouter } from "../src/rag/ingestion/parsers.ts";
import type { RagParser } from "../src/rag/ingestion/types.ts";
describe("parser routing",()=>{ it("selects by MIME without hard-coding parser implementation",()=>{ const parser:RagParser={parserVersion:"pdf-v1",supports:(m)=>m==="application/pdf",parse:async()=>({parserVersion:"pdf-v1",blocks:[],requiresVision:true})}; expect(new StaticRagParserRouter([parser]).resolve("application/pdf","x.pdf")?.parserVersion).toBe("pdf-v1"); }); });
