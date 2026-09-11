import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "../src/data-access/in-memory-repository.ts";

interface ExampleRecord {
	id: string;
	name: string;
}

describe("InMemoryRepository", () => {
	it("supports seed, lookup, list, and upsert without external persistence", async () => {
		const repository = new InMemoryRepository<ExampleRecord>([{ id: "1", name: "first" }]);

		expect(await repository.getById("1")).toEqual({ id: "1", name: "first" });
		await repository.upsert({ id: "2", name: "second" });
		expect(await repository.list()).toEqual([
			{ id: "1", name: "first" },
			{ id: "2", name: "second" },
		]);
	});
});
