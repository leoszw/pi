import { structuralAncestorCodes } from "./normalizer.ts";

export interface BoqHierarchySourceItem {
	code: string;
	name: string;
}
export interface BoqHierarchyInfo {
	codeSegments: readonly string[];
	parentCode?: string;
	ancestorCodes: readonly string[];
	existingAncestorCodes: readonly string[];
	missingAncestorCodes: readonly string[];
	hierarchyGap: boolean;
	depth: number;
	hasChildren: boolean;
	isLeaf: boolean;
	pathNames: readonly string[];
	pathText: string;
}

export function buildBoqHierarchyCatalog(items: readonly BoqHierarchySourceItem[]): Map<string, BoqHierarchyInfo> {
	const byCode = new Map(items.map((item) => [item.code, item]));
	const hasChildren = new Set<string>();
	for (const item of items) {
		for (const ancestor of structuralAncestorCodes(item.code)) if (byCode.has(ancestor)) hasChildren.add(ancestor);
	}
	const output = new Map<string, BoqHierarchyInfo>();
	for (const item of items) {
		const ancestors = structuralAncestorCodes(item.code);
		const existing = ancestors.filter((code) => byCode.has(code));
		const missing = ancestors.filter((code) => !byCode.has(code));
		const pathNames = [
			...existing.map((code) => byCode.get(code)?.name).filter((name): name is string => Boolean(name)),
			item.name,
		];
		output.set(item.code, {
			codeSegments: item.code.split("-"),
			...(ancestors.at(-1) ? { parentCode: ancestors.at(-1)! } : {}),
			ancestorCodes: ancestors,
			existingAncestorCodes: existing,
			missingAncestorCodes: missing,
			hierarchyGap: missing.length > 0,
			depth: item.code.split("-").length,
			hasChildren: hasChildren.has(item.code),
			isLeaf: !hasChildren.has(item.code),
			pathNames,
			pathText: pathNames.join(" > "),
		});
	}
	return output;
}
