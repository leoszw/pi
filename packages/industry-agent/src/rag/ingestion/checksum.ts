import { createHash } from "node:crypto";

export function sha256Bytes(content: Uint8Array): string {
	return createHash("sha256").update(content).digest("hex");
}

export function sha256Text(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}
