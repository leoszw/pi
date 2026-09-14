import { TextDecoder } from "node:util";
import type { RagExtractedBlock, RagParsedDocument, RagParser, RagParserRouter, RagUploadFile } from "./types.ts";

export class StaticRagParserRouter implements RagParserRouter {
	private readonly parsers: readonly RagParser[];
	constructor(parsers: readonly RagParser[]) {
		this.parsers = [...parsers];
	}
	resolve(mimeType: string, fileName: string): RagParser | undefined {
		return this.parsers.find((parser) => parser.supports(mimeType, fileName));
	}
}

function decode(file: RagUploadFile): string {
	return new TextDecoder("utf-8", { fatal: false }).decode(file.content).normalize("NFKC");
}

export class StructuredTextRagParser implements RagParser {
	readonly parserVersion: string;
	constructor(parserVersion = "structured-text-v1") {
		this.parserVersion = parserVersion;
	}
	supports(mimeType: string): boolean {
		return ["text/plain", "text/markdown", "text/html"].includes(mimeType);
	}
	async parse(file: RagUploadFile): Promise<RagParsedDocument> {
		const source = decode(file).replace(/\r\n?/g, "\n");
		const lines = source.split("\n");
		const blocks: RagExtractedBlock[] = [];
		const headings: { level: number; text: string; blockId: string }[] = [];
		let buffer: string[] = [];
		let seq = 0;
		const flush = (type: RagExtractedBlock["type"] = "PARAGRAPH") => {
			const text = buffer.join("\n").trim();
			buffer = [];
			if (!text) return;
			const parent = headings.at(-1);
			blocks.push({
				blockId: `b${++seq}`,
				...(parent ? { parentBlockId: parent.blockId } : {}),
				type,
				text,
				sectionPath: headings.map((item) => item.text),
				pageStart: 1,
				pageEnd: 1,
			});
		};
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!.trimEnd();
			const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
			if (heading) {
				flush();
				const level = heading[1]!.length;
				while (headings.length && headings.at(-1)!.level >= level) headings.pop();
				const blockId = `b${++seq}`;
				const text = heading[2]!.trim();
				const parent = headings.at(-1);
				blocks.push({
					blockId,
					...(parent ? { parentBlockId: parent.blockId } : {}),
					type: level === 1 ? "TITLE" : "HEADING",
					text,
					sectionPath: [...headings.map((item) => item.text), text],
					pageStart: 1,
					pageEnd: 1,
					level,
				});
				headings.push({ level, text, blockId });
				continue;
			}
			if (/^\|.*\|$/.test(line.trim())) {
				flush();
				const table: string[] = [line.trim()];
				while (i + 1 < lines.length && /^\|.*\|$/.test(lines[i + 1]!.trim())) table.push(lines[++i]!.trim());
				buffer = table;
				flush("TABLE");
				continue;
			}
			if (/^第[一二三四五六七八九十百千万0-9]+条/.test(line.trim())) {
				flush();
				buffer = [line.trim()];
				flush("CLAUSE");
				continue;
			}
			if (!line.trim()) flush();
			else buffer.push(line);
		}
		flush();
		return { parserVersion: this.parserVersion, blocks, requiresVision: false };
	}
}
