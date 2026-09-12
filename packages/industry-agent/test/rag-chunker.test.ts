import { describe, expect, it } from "vitest";
import { StructureAwareRagChunker } from "../src/rag/ingestion/index.ts";
describe("structure-aware chunker",()=>{
	it("keeps tables whole, preserves parent/page/section, windows only long blocks",()=>{
		const c=new StructureAwareRagChunker("v1",{maxSectionTokens:10,overlapTokens:2});
		const chunks=c.chunk("d",[
			{blockId:"h",type:"HEADING",text:"第一章",sectionPath:["第一章"],pageStart:2,pageEnd:2},
			{blockId:"t",parentBlockId:"h",type:"TABLE",text:"|a|b|\n|1|2|",sectionPath:["第一章"],pageStart:3,pageEnd:3},
			{blockId:"p",parentBlockId:"h",type:"PARAGRAPH",text:"这是很长的段落".repeat(12),sectionPath:["第一章"],pageStart:4,pageEnd:5},
		]);
		expect(chunks.filter(x=>x.sourceBlockId==="t").length).toBe(1); expect(chunks.filter(x=>x.sourceBlockId==="p").length).toBeGreaterThan(1); expect(chunks[1]?.parentChunkId).toBe(chunks[0]?.chunkId); expect(chunks.at(-1)?.pageEnd).toBe(5);
	});
});
