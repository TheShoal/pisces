import * as path from "node:path";
import type { SearchDb } from "@oh-my-pi/pi-natives";
import { type GrepMatch, grep } from "@oh-my-pi/pi-natives";
import {
	combineSearchGlobs,
	normalizePathLikeInput,
	parseSearchPath,
	resolveMultiSearchPath,
	resolveToCwd,
} from "../../path-utils";
import type { RetrievalHit, SearchParams } from "../types";
import type { RetrievalSource } from "./index";

/**
 * Grep source wrapper - provides text search via ripgrep.
 * Normalizes ripgrep results to RetrievalHit format.
 */
export class GrepSource implements RetrievalSource {
	readonly name = "grep" as const;

	constructor(
		private readonly cwd: string,
		private readonly searchDb?: SearchDb,
	) {}

	async search(params: SearchParams): Promise<RetrievalHit[]> {
		const { query, path: searchDir, glob, lang, i = false, multiline = false, context = 0, limit = 50 } = params;

		// Resolve search path
		let searchPath = resolveToCwd(".", this.cwd);
		let globFilter = glob ? normalizePathLikeInput(glob) || undefined : undefined;

		if (searchDir?.trim()) {
			const rawPath = normalizePathLikeInput(searchDir);
			const multiSearchPath = await resolveMultiSearchPath(rawPath, this.cwd, globFilter);
			if (multiSearchPath) {
				searchPath = multiSearchPath.basePath;
				globFilter = multiSearchPath.glob;
			} else {
				const parsedPath = parseSearchPath(rawPath);
				searchPath = resolveToCwd(parsedPath.basePath, this.cwd);
				if (parsedPath.glob) {
					globFilter = combineSearchGlobs(parsedPath.glob, globFilter);
				}
			}
		}

		const normalizedPattern = query.trim();
		if (!normalizedPattern) {
			return [];
		}

		const patternHasNewline = normalizedPattern.includes("\n") || normalizedPattern.includes("\\n");
		const effectiveMultiline = multiline || patternHasNewline;

		let result: Awaited<ReturnType<typeof grep>>;
		try {
			result = await grep(
				{
					pattern: normalizedPattern,
					path: searchPath,
					glob: globFilter,
					type: lang?.trim(),
					ignoreCase: i,
					multiline: effectiveMultiline,
					hidden: true,
					gitignore: true,
					cache: false,
					maxCount: limit * 2, // Fetch extra for deduplication headroom
					offset: 0,
					contextBefore: context,
					contextAfter: context,
					maxColumns: 200,
					mode: "content",
				},
				undefined,
				this.searchDb,
			);
		} catch (err) {
			// Return empty on error (tool will surface its own error)
			if (err instanceof Error && err.message.startsWith("regex parse error")) {
				throw err;
			}
			return [];
		}

		return this.normalizeMatches(result.matches, normalizedPattern, i, effectiveMultiline);
	}

	private normalizeMatches(
		matches: GrepMatch[],
		pattern: string,
		caseInsensitive: boolean,
		multiline: boolean,
	): RetrievalHit[] {
		const hits: RetrievalHit[] = [];

		for (const match of matches) {
			const cleanPath = match.path.startsWith("/") ? match.path.slice(1) : match.path;
			const relativePath = path.relative(this.cwd, cleanPath).replace(/\\/g, "/");

			// Build snippet from matched line
			let snippet = match.line;
			if (match.contextBefore) {
				const beforeText = match.contextBefore.map(ctx => ctx.line).join("\n");
				snippet = `${beforeText}\n${snippet}`;
			}
			if (match.contextAfter) {
				const afterText = match.contextAfter.map(ctx => ctx.line).join("\n");
				snippet = `${snippet}\n${afterText}`;
			}

			hits.push({
				path: relativePath || cleanPath,
				line: match.lineNumber,
				// No byteOffset in GrepMatch type, column not available
				snippet: snippet.slice(0, 500), // Truncate long snippets
				source: "grep",
				score: 1.0, // Base score, merger will adjust
				context: {
					matchType: "exact",
					pattern,
					caseInsensitive,
					multiline,
				},
			});
		}

		return hits;
	}
}
