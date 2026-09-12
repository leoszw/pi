import { describe, expect, it } from "vitest";
import { buildAccessFilter, isAccessible, validateMetadataFilter } from "../src/rag/qa/access.ts";
import { chunk, document, scope } from "./rag-qa-helpers.ts";

describe("rag qa access",()=>{
 it("enforces visibility, explicit ACL and security tags before retrieval",()=>{
  const access={userId:"u2",tenantId:"t1",companyId:"c1",projectId:"p1",industryId:"i1",departmentId:null,roles:["engineer"],securityTags:["S1"]};
  const filter=buildAccessFilter(access,{},"v1");
  expect(isAccessible(document("d",{scope:{...scope,ownerUserId:"u1",aclRoles:["engineer"],securityTags:["S1"]}}),chunk("k","d","x",{scope:{...scope,ownerUserId:"u1",aclRoles:["engineer"],securityTags:["S1"]}}),filter)).toBe(true);
  expect(isAccessible(document("d",{scope:{...scope,ownerUserId:"u1",securityTags:["S2"]}}),chunk("k","d","x",{scope:{...scope,ownerUserId:"u1",securityTags:["S2"]}}),filter)).toBe(false);
  expect(isAccessible(document("d",{scope:{...scope,ownerUserId:"u3",departmentId:"dep-2"}}),chunk("k","d","x",{scope:{...scope,ownerUserId:"u3",departmentId:"dep-2"}}),filter)).toBe(false);
 });
 it("rejects scope or acl override fields disguised as metadata",()=>{
  expect(()=>validateMetadataFilter({tenantId:"evil"} as never)).toThrow(/Unsupported metadata filter/);
 });
});
