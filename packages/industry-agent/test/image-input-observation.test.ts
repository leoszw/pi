import { describe, expect, it } from "vitest";
import { observations, request, service } from "./image-input-helpers.ts";

describe("M9 observation JSON validation", () => {
	it("rejects duplicate observation ids", async () => {
		const duplicate = {
			...observations,
			observations: [observations.observations[0]!, { ...observations.observations[0]! }],
		};
		const { instance } = service({ bundle: duplicate });
		await expect(instance.process(request())).rejects.toMatchObject({ code: "IMAGE_OBSERVATION_INVALID" });
	});

	it("rejects invalid normalized bounding boxes", async () => {
		const invalid = {
			...observations,
			observations: [{ ...observations.observations[0]!, bbox: { x: 0.9, y: 0.1, width: 0.2, height: 0.2 } }],
		};
		const { instance } = service({ bundle: invalid });
		await expect(instance.process(request())).rejects.toMatchObject({ code: "IMAGE_OBSERVATION_INVALID" });
	});
});
