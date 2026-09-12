import type { JsonObject, RequestContext } from "../src/contracts/index.ts";
import {
	InMemoryRagChunkRepository, InMemoryRagDocumentRepository, InMemoryRagLexicalIndex, InMemoryRagObjectStorage,
	InMemoryRagPermissionService, InMemoryRagTraceSink, InMemoryRagVectorIndex, RagIngestionService, StaticRagParserRouter,
	StrictRagQualityValidator, StructureAwareRagChunker, StructuredTextRagParser,
} from "../src/rag/ingestion/index.ts";
import type { RagChunkDraft, RagChunkEnrichment, RagDocumentRecord, RagEmbeddingProvider, RagEnricher, RagKnowledgeScope } from "../src/rag/ingestion/types.ts";

export const ragTestContext: RequestContext = { traceId:"t1", requestId:"r1", conversationId:"c1", userId:"u1", tenantId:"tenant1", companyId:"co1", projectId:"p1", createdAt:"2026-09-12T00:00:00Z" };
export const ragTestScope: RagKnowledgeScope = { tenantId:"tenant1", industryId:"ind1", companyId:"co1", projectId:"p1", departmentId:"d1", ownerUserId:"u1", visibility:"PROJECT", aclUsers:["u1"], aclRoles:["engineer"], securityTags:["internal"] };
class NoopEnricher implements RagEnricher { async enrich(_d:RagDocumentRecord,chunks:readonly RagChunkDraft[]):Promise<readonly RagChunkEnrichment[]> { return chunks.map((_,i)=>({entityIds:[`e${i+1}`], metadata:{enriched:true} as JsonObject})); } }
class FakeEmbedding implements RagEmbeddingProvider { readonly version="embed-v1"; readonly dimension=3; async embed(texts:readonly string[]){ return texts.map((_,i)=>[i+1,0,0] as const); } }
export function makeRagHarness(customQuality = new StrictRagQualityValidator()) {
	const permissions=new InMemoryRagPermissionService(); permissions.allow({userId:"u1",scope:ragTestScope,permission:"knowledge.ingest"});
	const documents=new InMemoryRagDocumentRepository(); const chunks=new InMemoryRagChunkRepository(); const storage=new InMemoryRagObjectStorage();
	const lexicalIndex=new InMemoryRagLexicalIndex("lex-v1"); const vectorIndex=new InMemoryRagVectorIndex("vec-v1"); const trace=new InMemoryRagTraceSink(); let id=0;
	const service=new RagIngestionService({permissions,documents,chunks,storage,parsers:new StaticRagParserRouter([new StructuredTextRagParser("parser-v1")]),chunker:new StructureAwareRagChunker("chunk-v1",{maxSectionTokens:24,overlapTokens:4}),enricher:new NoopEnricher(),embedding:new FakeEmbedding(),lexicalIndex,vectorIndex,quality:customQuality,trace,idFactory:()=>`doc-${++id}`,now:()=>new Date("2026-09-12T00:00:00Z")});
	return {service,permissions,documents,chunks,storage,lexicalIndex,vectorIndex,trace};
}
