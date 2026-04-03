import type { AgentTool, AgentToolContext, AgentToolResult, AgentToolUpdateCallback } from "@oh-my-pi/pi-agent-core";
import { logger, untilAborted } from "@oh-my-pi/pi-utils";

import type { ToolSession } from "../index";
import { replaceTabs, truncateToWidth } from "../render-utils";
import { ToolError } from "../tool-errors";
import { type DetailsWithMeta, toolResult } from "../tool-result";
import { mergeHits } from "./merger";
import { Ranker } from "./ranker";
import { Bm25Reranker } from "./rerankers/bm25";
import { createSourceRegistry, getSourcesForMode } from "./sources";
import { DEFAULT_SEARCH_LIMIT, type RetrievalHit, type SearchParams, type SearchResult, searchSchema } from "./types";

const TOOL_NAME = "hybrid_search";
const TOOL_TITLE = "Hybrid Search";
const SNIPPET_PREVIEW_LEN = 120;

/**
 * Unified search tool that orchestrates multiple retrieval sources.
 */
export class SearchTool implements AgentTool<typeof searchSchema, SearchToolDetails> {
	readonly name = TOOL_NAME;
	readonly label = TOOL_TITLE;
	readonly parameters = searchSchema;
	readonly strict = true;
	readonly description = "Unified retrieval across grep, ast_grep, and LSP sources";

	private readonly cwd: string;
	private readonly ranker: Ranker;

	constructor(private readonly session: ToolSession) {
		this.cwd = session.cwd;
		this.ranker = new Ranker();
	}

	async execute(
		_toolCallId: string,
		params: SearchParams,
		signal?: AbortSignal,
		_onUpdate?: AgentToolUpdateCallback<SearchToolDetails>,
		_context?: AgentToolContext,
	): Promise<AgentToolResult<SearchToolDetails>> {
		return untilAborted(signal, async () => {
			const {
				query,
				mode = "hybrid",
				path: searchPath,
				glob,
				lang,
				rerank = false,
				limit = DEFAULT_SEARCH_LIMIT,
				i,
				multiline,
				context,
			} = params;

			// Validate query
			if (!query.trim()) {
				throw new ToolError("Query must not be empty");
			}

			// Create source registry
			const registry = createSourceRegistry(this.cwd);

			// Get sources for the search mode
			const sources = getSourcesForMode(mode, registry, {
				searchDb: this.session.searchDb,
				signal,
			});

			if (sources.length === 0) {
				throw new ToolError(`No sources available for mode: ${mode}`);
			}

			// Execute searches in parallel
			const searchParams: SearchParams = {
				query,
				path: searchPath,
				glob,
				lang,
				i,
				multiline,
				context,
				limit,
			};

			const results = await Promise.allSettled(sources.map(source => source.search(searchParams)));

			// Collect hits from successful searches
			const allHits: RetrievalHit[] = [];
			const errors: string[] = [];

			for (let i = 0; i < results.length; i++) {
				const result = results[i];
				if (result.status === "fulfilled") {
					allHits.push(...result.value);
				} else {
					const sourceName = sources[i]?.name ?? "unknown";
					errors.push(`${sourceName}: ${result.reason?.message ?? "Unknown error"}`);
					logger.warn(`Search source ${sourceName} failed`, { error: result.reason });
				}
			}

			// Merge and deduplicate
			let searchResult = mergeHits(allHits, limit);

			// Apply ranking
			searchResult = {
				...searchResult,
				hits: this.ranker.rank(searchResult.hits),
			};

			// Apply BM25 reranking if requested
			if (rerank && searchResult.hits.length > 0) {
				const bm25Reranker = new Bm25Reranker();
				searchResult = {
					...searchResult,
					hits: await bm25Reranker.rerank(searchResult.hits, query),
				};
			}

			// Build output
			const outputLines = this.formatResults(searchResult, query);
			const details = this.buildDetails(searchResult, errors);

			return toolResult(details).text(outputLines.join("\n")).done();
		});
	}

	private formatResults(result: SearchResult, query: string): string[] {
		const lines: string[] = [];

		if (result.hits.length === 0) {
			return [`No results found for "${query}"`];
		}

		// Header
		lines.push(`# Search: ${query}`);
		lines.push(
			`Found ${result.hits.length} result${result.hits.length !== 1 ? "s" : ""} in ${result.fileCount} file${result.fileCount !== 1 ? "s" : ""}`,
		);

		if (result.truncated) {
			lines.push("(Results truncated)");
		}

		// Group by file
		const byFile = new Map<string, RetrievalHit[]>();
		for (const hit of result.hits) {
			if (!byFile.has(hit.path)) {
				byFile.set(hit.path, []);
			}
			byFile.get(hit.path)!.push(hit);
		}

		// Format each file
		for (const [filePath, hits] of byFile) {
			lines.push("");
			lines.push(`## ${filePath}`);

			for (const hit of hits.slice(0, 5)) {
				// Limit hits per file in preview
				const lineNum = hit.line ? `:${hit.line}` : "";
				const snippet = this.formatSnippet(hit.snippet ?? "");
				const source = hit.source;

				lines.push(`>${source}${lineNum}: ${snippet}`);
			}

			if (hits.length > 5) {
				lines.push(`  ... ${hits.length - 5} more in this file`);
			}
		}

		return lines;
	}

	private formatSnippet(snippet: string): string {
		const clean = replaceTabs(snippet).trim();
		return truncateToWidth(clean, SNIPPET_PREVIEW_LEN);
	}

	private buildDetails(result: SearchResult, errors: string[]): SearchToolDetails {
		return {
			query: result.hits[0]?.context?.pattern ?? "",
			hits: result.hits.map(hit => ({
				path: hit.path,
				line: hit.line,
				source: hit.source,
				score: hit.score,
				snippet: hit.snippet,
			})),
			fileCount: result.fileCount,
			truncated: result.truncated,
			sourceStats: result.sourceStats,
			errors: errors.length > 0 ? errors : undefined,
		};
	}
}

export interface SearchToolDetails extends DetailsWithMeta {
	query: string;
	hits: Array<{
		path: string;
		line?: number;
		source: string;
		score: number;
		snippet?: string;
	}>;
	fileCount: number;
	truncated: boolean;
	sourceStats: SearchResult["sourceStats"];
	errors?: string[];
}
