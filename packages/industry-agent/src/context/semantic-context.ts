import type { EntityMention, RequestContext, SemanticConstraint } from "../contracts/index.ts";

export interface NamedContextEntity {
	id: string;
	aliases?: readonly string[];
}

export interface SemanticContext {
	recentEntityIds?: readonly string[];
	project?: NamedContextEntity;
	segment?: NamedContextEntity;
}

export interface ResolvedSemanticContext {
	contextRefs: readonly string[];
	constraints: readonly SemanticConstraint[];
	mentions: readonly EntityMention[];
}

const DEICTIC_PATTERN = /(?:这个|那个|这些|那些|刚才(?:的|那些|这些)?|上一个|前一个|第二个|继续)/;

function exactMention(text: string, entity: NamedContextEntity, entityType: string): EntityMention | undefined {
	const candidates = [entity.id, ...(entity.aliases ?? [])].filter((value) => value.length > 0);
	for (const candidate of candidates) {
		const start = text.indexOf(candidate);
		if (start >= 0) {
			return { text: candidate, start, end: start + candidate.length, entityType, confidence: 0.99, source: "user" };
		}
	}
	return undefined;
}

export function resolveSemanticContext(
	text: string,
	requestContext: Pick<RequestContext, "projectId">,
	semanticContext?: SemanticContext,
): ResolvedSemanticContext {
	const constraints: SemanticConstraint[] = [];
	const mentions: EntityMention[] = [];
	const refs = new Set<string>();

	if (requestContext.projectId) {
		constraints.push({ field: "project_id", value: requestContext.projectId, confidence: 1, source: "context", mode: "hard" });
	}

	if (semanticContext?.project) {
		const mention = exactMention(text, semanticContext.project, "PROJECT");
		if (mention) {
			mentions.push(mention);
			if (!requestContext.projectId) {
				constraints.push({ field: "project_id", value: semanticContext.project.id, confidence: 0.99, source: "user", mode: "hard" });
			} else if (requestContext.projectId !== semanticContext.project.id) {
				constraints.push({ field: "project_candidate_id", value: semanticContext.project.id, confidence: 0.9, source: "user", mode: "soft" });
			}
		}
	}

	if (semanticContext?.segment) {
		const mention = exactMention(text, semanticContext.segment, "SEGMENT");
		if (mention) {
			mentions.push(mention);
			constraints.push({ field: "segment_id", value: semanticContext.segment.id, confidence: 0.98, source: "user", mode: "hard" });
		} else {
			constraints.push({ field: "segment_id", value: semanticContext.segment.id, confidence: 0.78, source: "context", mode: "soft" });
		}
	}

	if (DEICTIC_PATTERN.test(text)) {
		for (const id of semanticContext?.recentEntityIds ?? []) refs.add(id);
		if (refs.size > 0) {
			constraints.push({ field: "context_entity_ids", value: Array.from(refs).sort(), confidence: 0.75, source: "context", mode: "soft" });
		}
	}

	return { contextRefs: Array.from(refs).sort(), constraints, mentions };
}
