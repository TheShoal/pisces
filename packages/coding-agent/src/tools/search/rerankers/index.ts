import type { RetrievalHit } from "../types";

/**
 * Base reranker configuration.
 */
export interface RerankerConfig {
	/** Fields to use for reranking */
	fields?: (keyof RetrievalHit)[];
}

/**
 * Reranker interface for post-retrieval scoring.
 */
export interface Reranker {
	/**
	 * Rerank hits based on additional relevance signals.
	 * @param hits Initial retrieval hits
	 * @param query Original search query
	 * @returns Reranked hits with adjusted scores
	 */
	rerank(hits: RetrievalHit[], query: string): Promise<RetrievalHit[]>;
}

/**
 * Create a reranker based on configuration.
 */
export function createReranker(type: "bm25" | "semantic", config?: Record<string, unknown>): Reranker {
	switch (type) {
		case "bm25":
			return new (require("./bm25").Bm25Reranker)(config);
		case "semantic":
			// Default to placeholder if no config
			return new (require("./semantic").PlaceholderSemanticReranker)(config);
		default:
			throw new Error(`Unknown reranker type: ${type}`);
	}
}

export { type Bm25Config, Bm25Reranker, DEFAULT_BM25_CONFIG } from "./bm25";
export {
	DEFAULT_SEMANTIC_CONFIG,
	OpenAISemanticReranker,
	PlaceholderSemanticReranker,
	type SemanticConfig,
	SemanticReranker,
} from "./semantic";
