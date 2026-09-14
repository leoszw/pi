import { createHmac, timingSafeEqual } from "node:crypto";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { ApprovalTokenPayload, ApprovalTokenService } from "./types.ts";

function base64url(value: string | Buffer): string {
	return Buffer.from(value).toString("base64url");
}

function decodePart(value: string): Buffer {
	try {
		return Buffer.from(value, "base64url");
	} catch {
		throw new IndustryAgentError("MUTATION_APPROVAL_INVALID", "Approval token encoding is invalid");
	}
}

export class HmacApprovalTokenService implements ApprovalTokenService {
	private readonly secret: Buffer;
	constructor(secret: string | Uint8Array) {
		this.secret = Buffer.from(secret);
		if (this.secret.length < 32)
			throw new IndustryAgentError("INVALID_REQUEST", "Approval signing secret must be at least 32 bytes");
	}
	issue(payload: ApprovalTokenPayload): string {
		const body = base64url(JSON.stringify(payload));
		const signature = createHmac("sha256", this.secret).update(body).digest();
		return `${body}.${base64url(signature)}`;
	}
	verify(token: string): ApprovalTokenPayload {
		const [body, signatureText, extra] = token.split(".");
		if (!body || !signatureText || extra !== undefined)
			throw new IndustryAgentError("MUTATION_APPROVAL_INVALID", "Approval token format is invalid");
		const actual = decodePart(signatureText);
		const expected = createHmac("sha256", this.secret).update(body).digest();
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
			throw new IndustryAgentError("MUTATION_APPROVAL_INVALID", "Approval token signature is invalid");
		let parsed: unknown;
		try {
			parsed = JSON.parse(decodePart(body).toString("utf8"));
		} catch {
			throw new IndustryAgentError("MUTATION_APPROVAL_INVALID", "Approval token payload is invalid");
		}
		if (!parsed || typeof parsed !== "object")
			throw new IndustryAgentError("MUTATION_APPROVAL_INVALID", "Approval token payload is invalid");
		const p = parsed as Record<string, unknown>;
		const required = [
			"nonce",
			"operationId",
			"operationDigest",
			"recordVersion",
			"userId",
			"tenantId",
			"companyId",
			"projectId",
			"issuedAt",
			"expiresAt",
		];
		if (required.some((key) => typeof p[key] !== "string" || !(p[key] as string)))
			throw new IndustryAgentError("MUTATION_APPROVAL_INVALID", "Approval token binding is incomplete");
		return p as unknown as ApprovalTokenPayload;
	}
}
