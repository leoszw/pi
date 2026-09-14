import { exactCodeConfidence } from "../src/retrieval/boq/confidence.ts";
import { parseBoqQuery } from "../src/retrieval/boq/query-parser.ts";
import type { BoqSearchRequest, BoqSearchResponse } from "../src/retrieval/boq/types.ts";
import { directExactConfidence } from "../src/retrieval/engineering/confidence.ts";
import { ENGINEERING_RETRIEVAL_CONFIG_V1 } from "../src/retrieval/engineering/config.ts";
import { parseEngineeringQuery } from "../src/retrieval/engineering/query-parser.ts";
import type { EngineeringSearchRequest, EngineeringSearchResponse } from "../src/retrieval/engineering/types.ts";

/** Minimal type-valid responses for read-tool backend stubs; assertions never inspect them. */
export function stubEngineeringSearchResponse(request: EngineeringSearchRequest): EngineeringSearchResponse {
	return {
		parsedQuery: parseEngineeringQuery(request, ENGINEERING_RETRIEVAL_CONFIG_V1),
		confidence: directExactConfidence(),
		results: [],
	};
}

export function stubBoqSearchResponse(request: BoqSearchRequest): BoqSearchResponse {
	return { parsedQuery: parseBoqQuery(request), confidence: exactCodeConfidence(), results: [] };
}
