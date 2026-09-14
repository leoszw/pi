import { describe, expect, it } from "vitest";
import { InMemoryImageTraceSink } from "../src/multimodal/image-input/index.ts";
import { request, service } from "./image-input-helpers.ts";

describe("M9 trace stages", () => {
	it("records the safe pipeline through mutation prepare", async () => {
		const trace = new InMemoryImageTraceSink();
		const { instance } = service({ trace });
		await instance.process(request({ requestedOperation: "UPDATE" }));
		expect(trace.events.filter((event) => event.status === "OK").map((event) => event.stage)).toEqual([
			"AUTHORIZE",
			"VALIDATE",
			"STORE",
			"UNDERSTAND",
			"ENTITY_RESOLVE",
			"ACTION_PROPOSE",
			"MUTATION_PREPARE",
		]);
	});
});
