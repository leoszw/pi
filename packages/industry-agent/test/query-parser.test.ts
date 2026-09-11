import { describe, expect, it } from "vitest";
import { canonicalizeSemanticFrame, semanticFrameToCanonicalJson } from "../src/semantic/canonical.ts";
import { QueryParser } from "../src/semantic/query-parser.ts";

const CREATED_AT = "2026-09-11T00:00:00.000Z";

describe("QueryParser", () => {
	it("produces canonical hard filters while preserving large project ids as strings", () => {
		const parser = new QueryParser();
		const frame = parser.parse({
			text: "查K12+300左幅清单编号202-1-a的工程量，单位m3",
			requestContext: { projectId: "123456789012345678", createdAt: CREATED_AT },
		});

		expect(frame.intent).toBe("QUERY_BOQ");
		expect(frame.filters).toEqual({
			boq_code: "202-1-A",
			chainage_m: 12300,
			project_id: "123456789012345678",
			side: "LEFT",
			unit: "m3",
		});
		expect(typeof frame.filters.project_id).toBe("string");
		expect(frame.requestedFields).toEqual(["quantity", "unit"]);
	});

	it("keeps low-confidence side and inherited segment context out of hard filters", () => {
		const parser = new QueryParser();
		const frame = parser.parse({
			text: "查K12+300左边的部位",
			requestContext: { createdAt: CREATED_AT },
			semanticContext: { segment: { id: "segment-1" } },
		});

		expect(frame.intent).toBe("QUERY_ENGINEERING_POSITION");
		expect(frame.filters.chainage_m).toBe(12300);
		expect(frame.filters.side).toBeUndefined();
		expect(frame.filters.segment_id).toBeUndefined();
		expect(frame.constraints.find((constraint) => constraint.field === "side")).toMatchObject({
			value: "LEFT",
			confidence: 0.88,
			mode: "soft",
		});
		expect(frame.constraints.find((constraint) => constraint.field === "segment_id")).toMatchObject({
			value: "segment-1",
			mode: "soft",
			source: "context",
		});
	});

	it("resolves deictic references as context refs without hard-filtering them", () => {
		const parser = new QueryParser();
		const frame = parser.parse({
			text: "这些的工程量是多少",
			requestContext: { createdAt: CREATED_AT },
			semanticContext: { recentEntityIds: ["entity-2", "entity-1"] },
		});

		expect(frame.contextRefs).toEqual(["entity-1", "entity-2"]);
		expect(frame.filters.context_entity_ids).toBeUndefined();
		expect(frame.constraints.find((constraint) => constraint.field === "context_entity_ids")).toMatchObject({
			confidence: 0.75,
			mode: "soft",
			source: "context",
		});
	});

	it("does not let a conflicting project candidate widen an authoritative project scope", () => {
		const parser = new QueryParser();
		const frame = parser.parse({
			text: "查项目乙的清单",
			requestContext: { projectId: "project-a", createdAt: CREATED_AT },
			semanticContext: { project: { id: "project-b", aliases: ["项目乙"] } },
		});

		expect(frame.filters.project_id).toBe("project-a");
		expect(frame.filters.project_candidate_id).toBeUndefined();
		expect(frame.constraints.find((constraint) => constraint.field === "project_candidate_id")).toMatchObject({
			value: "project-b",
			mode: "soft",
		});
	});

	it("does not create a filter for malformed chainage", () => {
		const parser = new QueryParser();
		const frame = parser.parse({
			text: "查K12+1200附近的工程部位",
			requestContext: { createdAt: CREATED_AT },
		});

		expect(frame.filters.chainage_m).toBeUndefined();
		expect(frame.constraints.some((constraint) => constraint.field.startsWith("chainage"))).toBe(false);
	});

	it("serializes equivalent frames to stable canonical JSON", () => {
		const parser = new QueryParser();
		const frame = parser.parse({
			text: "查K12+300左幅的部位",
			requestContext: { createdAt: CREATED_AT },
		});
		const reordered = canonicalizeSemanticFrame({
			...frame,
			constraints: [...frame.constraints].reverse(),
			mentions: [...frame.mentions].reverse(),
		});

		expect(semanticFrameToCanonicalJson(frame)).toBe(semanticFrameToCanonicalJson(reordered));
	});
});
