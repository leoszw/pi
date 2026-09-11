import { describe, expect, it } from "vitest";
import { calculateBoqBenchmarkMetrics } from "../src/retrieval/boq/metrics.ts";

describe("BOQ metrics", () => {
	it("computes exact recall ambiguity and latency metrics", () => {
		const metrics=calculateBoqBenchmarkMetrics([{expectedLedgerIds:["a"],rankedLedgerIds:["a"],operation:"SEARCH",queryMode:"CODE",codeExactExpected:true,criticalSpecConflictTop1:false,autoAccept:true,autoAcceptCorrect:true,latencyMs:10},{expectedLedgerIds:["b"],rankedLedgerIds:[],operation:"SEARCH",queryMode:"SPEC",criticalSpecConflictTop1:false,autoAccept:false,autoAcceptCorrect:false,latencyMs:20}]);
		expect(metrics.codeExactAccuracy).toBe(1); expect(metrics.recallAt10).toBe(0.5); expect(metrics.zeroResultRate).toBe(0.5); expect(metrics.p95LatencyMs).toBe(20);
	});
});
