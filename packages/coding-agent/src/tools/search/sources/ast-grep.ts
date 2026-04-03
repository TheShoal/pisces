import * as path from "node:path";

import { astGrep } from "@oh-my-pi/pi-natives";
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
 * AST Grep source wrapper - provides structural code search.
 * Normalizes ast-grep results to RetrievalHit format.
 */
export class AstGrepSource implements RetrievalSource {
	readonly name = "ast_grep" as const;

	constructor(
		private readonly cwd: string,
		private readonly signal?: AbortSignal,
	) {}

	async search(params: SearchParams): Promise<RetrievalHit[]> {
		const { query, path: searchDir, glob, lang, context = 0, limit = 50 } = params;

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

		const pattern = query.trim();
		if (!pattern) {
			return [];
		}

		let result: Awaited<ReturnType<typeof astGrep>>;
		try {
			result = await astGrep({
				patterns: [pattern],
				lang: lang?.trim(),
				path: searchPath,
				glob: globFilter,
				selector: undefined,
				limit: limit * 2, // Fetch extra for deduplication headroom
				offset: 0,
				context,
				includeMeta: true,
				signal: this.signal,
			});
		} catch {
			// Return empty on error
			return [];
		}

		return this.normalizeMatches(result.matches, pattern, lang);
	}

	private normalizeMatches(
		matches: Array<{
			path: string;
			startLine: number;
			startColumn: number;
			endLine?: number;
			endColumn?: number;
			text: string;
			metaVariables?: Record<string, string>;
		}>,
		pattern: string,
		lang?: string,
	): RetrievalHit[] {
		const hits: RetrievalHit[] = [];

		for (const match of matches) {
			const cleanPath = match.path.startsWith("/") ? match.path.slice(1) : match.path;
			const relativePath = path.relative(this.cwd, cleanPath).replace(/\\/g, "/");

			// Determine AST kind from text (heuristic)
			const astKind = this.inferAstKind(match.text);

			hits.push({
				path: relativePath || cleanPath,
				line: match.startLine,
				column: match.startColumn,
				endLine: match.endLine ?? match.startLine,
				endColumn: match.endColumn,
				snippet: match.text.slice(0, 500),
				source: "ast_grep",
				score: 1.0, // Base score
				context: {
					matchType: "exact",
					pattern,
					astKind,
					lang,
				},
			});
		}

		return hits;
	}

	private inferAstKind(text: string): string {
		// Simple heuristics based on matched text
		const trimmed = text.trim();
		if (trimmed.startsWith("function ") || trimmed.startsWith("async function ")) {
			return "function_declaration";
		}
		if (trimmed.startsWith("const ") || trimmed.startsWith("let ") || trimmed.startsWith("var ")) {
			return "variable_declarator";
		}
		if (trimmed.startsWith("class ")) {
			return "class_declaration";
		}
		if (trimmed.startsWith("import ")) {
			return "import_declaration";
		}
		if (trimmed.startsWith("export ")) {
			return "export_statement";
		}
		if (trimmed.includes("=>")) {
			return "arrow_function";
		}
		return "expression";
	}
}
