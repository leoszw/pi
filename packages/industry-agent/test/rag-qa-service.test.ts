import { describe, expect, it } from "vitest";
import { RagQaService } from "../src/rag/qa/service.ts";
import { context, options } from "./rag-qa-helpers.ts";

describe("rag qa service", () => {
	it("answers with traceable citation pack", async () => {
		const result = await new RagQaService(options()).answer({ context, question: "桥梁 混凝土", debug: true });
		expect(result.status).toBe("ANSWERED");
		expect(result.citations[0]).toMatchObject({
			documentId: "d1",
			chunkId: "k1",
			page: 1,
			pageStart: 1,
			pageEnd: 1,
			section: "桥梁工程 > 施工要求",
			sourceVersion: "sha-d1",
		});
		expect(result.citations[0]?.sectionPath).toEqual(["桥梁工程", "施工要求"]);
	});
});
