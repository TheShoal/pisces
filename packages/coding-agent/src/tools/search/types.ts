import { type Static, Type } from "@sinclair/typebox";

/** Sources that can produce retrieval hits */
export type RetrievalSourceType = "grep" | "ast_grep" | "lsp" | "semantic";

/** How the hit was matched */
export type MatchType = "exact" | "fuzzy" | "semantic";

/**
 * Unified hit format for all retrieval sources.
 * Provides provenance tracking (which tool found what) alongside content.
 */
export interface RetrievalHit {
	/** File path relative to repo root or absolute */
	path: string;
	/** 1-indexed line number of match start */
	line?: number;
	/** 1-indexed column of match start */
	column?: number;
	/** 1-indexed line number of match end */
	endLine?: number;
	/** 1-indexed column of match end */
	endColumn?: number;
	/** Matched text snippet (may be truncated) */
	snippet?: string;
	/** Which retrieval source produced this hit */
	source: RetrievalSourceType;
	/** Relevance score from the source (higher = more relevant) */
	score: number;
	/** Source-specific context metadata */
	context?: HitContext;
}

/** Additional metadata about how a hit was found */
export interface HitContext {
	/** How the hit was matched */
	matchType?: MatchType;
	/** Pattern or query string that matched */
	pattern?: string;
	/** For LSP symbol results: the symbol name */
	symbolName?: string;
	/** For AST results: the AST node kind */
	astKind?: string;
	/** For grep: whether case was ignored */
	caseInsensitive?: boolean;
	/** For grep: whether pattern was multiline */
	multiline?: boolean;
	/** Language for AST queries */
	lang?: string;
	/** AST selector used (if any) */
	astSelector?: string;
	/** Number of matches in the same file (frecency signal) */
	fileMatchCount?: number;
	/** Total files containing matches (for deduplication scoring) */
	totalFileCount?: number;
}

/** Search mode determines which sources are activated */
export type SearchMode = "text" | "structural" | "semantic" | "hybrid";

/** Input schema for the unified search tool */
export const searchSchema = Type.Object({
	query: Type.String({ description: "Search query (text or pattern)" }),
	mode: Type.Optional(
		Type.Union([Type.Literal("text"), Type.Literal("structural"), Type.Literal("semantic"), Type.Literal("hybrid")], {
			description: "Search mode: text (grep), structural (ast_grep), semantic (LSP), or hybrid (all)",
		}),
	),
	path: Type.Optional(Type.String({ description: "File or directory to search (default: cwd)" })),
	glob: Type.Optional(Type.String({ description: "Filter files by glob pattern (e.g., '*.js')" })),
	lang: Type.Optional(Type.String({ description: "Language for structural search (e.g., typescript, python)" })),
	rerank: Type.Optional(Type.Boolean({ description: "Enable BM25 reranking (default: false)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum hits to return (default: 50)" })),
	i: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
	multiline: Type.Optional(Type.Boolean({ description: "Enable multiline matching for text mode (default: false)" })),
	context: Type.Optional(Type.Number({ description: "Context lines around each match (default: 0)" })),
});

export type SearchParams = Static<typeof searchSchema>;

/** Default configuration values */
export const DEFAULT_SEARCH_LIMIT = 50;
export const DEFAULT_CONTEXT_LINES = 0;

/** Source weights for hybrid scoring (higher = more trusted) */
export const SOURCE_WEIGHTS: Record<RetrievalSourceType, number> = {
	// LSP provides highly semantic matches
	lsp: 1.2,
	// ast_grep provides structural matches
	ast_grep: 1.0,
	// grep provides text matches
	grep: 0.9,
	// semantic (future) embeddings
	semantic: 0.8,
};

/** Merged search result with aggregated metadata */
export interface SearchResult {
	/** All hits across all sources, deduplicated and ranked */
	hits: RetrievalHit[];
	/** Breakdown by source */
	sourceStats: SourceStats;
	/** Whether results were truncated */
	truncated: boolean;
	/** Total unique files with matches */
	fileCount: number;
}

export interface SourceStats {
	grep: { count: number; score: number };
	ast_grep: { count: number; score: number };
	lsp: { count: number; score: number };
	semantic: { count: number; score: number };
}
