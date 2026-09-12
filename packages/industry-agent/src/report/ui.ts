import type { UIAction } from "../contracts/index.ts";
import type { ReportArtifact } from "./types.ts";

export function buildReportPreviewAction(reportId: string, artifacts: readonly ReportArtifact[]): UIAction {
	return {
		id: `${reportId}:preview`,
		type: "report_preview",
		payload: {
			reportId,
			artifacts: artifacts.map((artifact) => ({
				artifactId: artifact.artifactId,
				format: artifact.format,
				fileName: artifact.fileName,
				mimeType: artifact.mimeType,
				sizeBytes: artifact.sizeBytes,
				checksumSha256: artifact.checksumSha256,
				rendererVersion: artifact.rendererVersion,
				evidenceIds: artifact.evidenceIds,
			})),
		},
	};
}
