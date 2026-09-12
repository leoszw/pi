import { describe, expect, it } from "vitest";
import { request, service } from "./image-input-helpers.ts";

describe("M9 mutation prepare integration", () => {
	it("prepares a complete scoped action but does not expose commit", async () => {
		const { instance, preparer } = service();
		const result = await instance.process(request({ requestedOperation: "UPDATE", userInstruction: "把识别到的负责人更新到这个部位" }));
		expect(result.status).toBe("PREPARED");
		expect(result.mutationPrepare?.proposal.status).toBe("PREPARED");
		expect(result.uiActions.some((item) => item.type === "mutation_confirmation")).toBe(true);
		expect(preparer.calls).toHaveLength(1);
		expect("approve" in instance).toBe(false);
		expect("commit" in instance).toBe(false);
	});

	it("can return NO_ACTION without preparing a mutation", async () => {
		const { instance, preparer } = service({ proposal: null });
		const result = await instance.process(request());
		expect(result.status).toBe("NO_ACTION");
		expect(preparer.calls).toHaveLength(0);
	});
});
