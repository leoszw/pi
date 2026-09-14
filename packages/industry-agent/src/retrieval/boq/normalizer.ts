export function normalizeBoqText(value: string): string {
	return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeLedgerCode(value: string): string | undefined {
	let code = normalizeBoqText(value).toLowerCase().replace(/[—–_]/g, "-");
	code = code.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
	code = code.replace(/-(\d+)([a-z])$/i, "-$1-$2");
	return /^\d+(?:-[0-9a-z]+)*$/i.test(code) ? code : undefined;
}

export function normalizeLedgerName(value: string): string {
	return normalizeBoqText(value)
		.replace(/[（]/g, "(")
		.replace(/[）]/g, ")")
		.replace(/[ΦФфØ]/g, "φ")
		.replace(/砼/g, "混凝土")
		.replace(/\b(hrb|hpb)(\d+)\b/gi, (_, family: string, grade: string) => `${family.toUpperCase()}${grade}`)
		.replace(/\bc(\d+)\b/gi, (_, grade: string) => `C${grade}`);
}

export function normalizeBoqUnit(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const raw = normalizeBoqText(value).toLowerCase();
	const map: Readonly<Record<string, string>> = {
		"㎡": "m²",
		"m²": "m²",
		m2: "m²",
		平方米: "m²",
		"m³": "m³",
		m3: "m³",
		立方米: "m³",
		m: "m",
		米: "m",
		kg: "kg",
		千克: "kg",
		t: "t",
		吨: "t",
		km: "km",
		公里: "km",
	};
	return (map[raw] ?? raw) || undefined;
}

export function structuralAncestorCodes(code: string): string[] {
	const parts = code.split("-");
	const ancestors: string[] = [];
	for (let index = 1; index < parts.length; index += 1) ancestors.push(parts.slice(0, index).join("-"));
	return ancestors;
}
