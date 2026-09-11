export function normalizeEntityAlias(value: string): string {
	return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function requireEntityIdentifier(name: string, value: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new Error(`${name} must not be empty`);
	return trimmed;
}
