import { describe, expect, it } from "vitest";
import { buildGoldenCorpusManifest, buildPhase11GoldenCorpus, validateGoldenCorpus } from "../src/eval/index.ts";

describe("phase 11 committed corpus", () => {
	it("materializes 1030 balanced cases with a locked canonical fingerprint", () => {
		const corpus = buildPhase11GoldenCorpus();
		const validation = validateGoldenCorpus(corpus, 1000, 50);
		const manifest = buildGoldenCorpusManifest(corpus);
		expect(validation.valid).toBe(true);
		expect(corpus.cases.length).toBe(1030);
		expect(manifest.canonicalSha256).toBe("3750ffb931517fd52a9477ce497933304b6333d4bf09935bb5bc3d1164a100c7");
	});
});
