import { describe, expect, it } from "vitest";
import {
	InMemoryReportPermissionService,
	InMemoryReportRendererRegistry,
	ReportService,
	StaticReportRenderer,
} from "../src/report/index.ts";
import { limits, request } from "./report-helpers.ts";

describe("M11 report timeout", () => {
	it("aborts a renderer that exceeds its deadline", async () => {
		const slow = new StaticReportRenderer(
			"EXCEL",
			"slow-v1",
			(_input, signal) =>
				new Promise((resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					setTimeout(
						() =>
							resolve({
								content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
								mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
								extension: "xlsx",
								hasFormulas: false,
								hasExternalLinks: false,
								hasRemoteResources: false,
								hasExecutableContent: false,
								hasRawHtml: false,
								embeddedEvidenceIds: ["fact-1"],
							}),
						100,
					);
				}),
		);
		const service = new ReportService({
			permissions: new InMemoryReportPermissionService(),
			renderers: new InMemoryReportRendererRegistry([slow]),
			limits: { ...limits, renderTimeoutMs: 5 },
		});
		await expect(service.generate(request())).rejects.toMatchObject({ code: "REPORT_RENDER_FAILED" });
	});
});
