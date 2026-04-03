import type { RetrievalHit } from "../types";

/**
 * Semantic reranker configuration.
 */
export interface SemanticConfig {
	/** Embedding model to use */
	model?: string;
	/** API endpoint for embeddings */
	endpoint?: string;
	/** API key for authentication */
	apiKey?: string;
	/** Batch size for embedding requests */
	batchSize: number;
	/** Fallback to BM25 if semantic fails */
	fallbackToBm25: boolean;
}

/** Default semantic reranker configuration */
export const DEFAULT_SEMANTIC_CONFIG: SemanticConfig = {
	batchSize: 32,
	fallbackToBm25: true,
};

/**
 * Semantic reranker interface.
 *
 * Implementations can use:
 * - Local embeddings (requires model download)
 * - API-based (OpenAI, Voyage, etc.)
 * - Placeholder that falls back to BM25
 */
export interface SemanticReranker {
	/**
	 * Rerank hits using semantic similarity.
	 */
	rerank(hits: RetrievalHit[], query: string): Promise<RetrievalHit[]>;

	/**
	 * Check if this reranker is available.
	 */
	isAvailable(): boolean;
}

/**
 * Placeholder semantic reranker that returns hits unchanged.
 * Use this when semantic reranking is not configured.
 */
export class PlaceholderSemanticReranker implements SemanticReranker {
	readonly config: SemanticConfig;

	constructor(config: Partial<SemanticConfig> = {}) {
		this.config = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
	}

	async rerank(hits: RetrievalHit[], _query: string): Promise<RetrievalHit[]> {
		// Return hits unchanged - placeholder implementation
		return hits;
	}

	isAvailable(): boolean {
		return false; // Placeholder is never "available"
	}
}

/**
 * OpenAI-compatible semantic reranker.
 *
 * Requires API configuration (endpoint, apiKey).
 * Falls back to BM25 if configured.
 */
export class OpenAISemanticReranker implements SemanticReranker {
	private readonly config: SemanticConfig;
	private bm25Fallback: { rerank: (hits: RetrievalHit[], query: string) => Promise<RetrievalHit[]> } | null = null;

	constructor(config: Partial<SemanticConfig> = {}) {
		this.config = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
	}

	isAvailable(): boolean {
		return Boolean(this.config.endpoint && this.config.apiKey);
	}

	private getBm25Fallback(): { rerank: (hits: RetrievalHit[], query: string) => Promise<RetrievalHit[]> } {
		if (!this.bm25Fallback) {
			const { Bm25Reranker } = require("./bm25");
			this.bm25Fallback = new Bm25Reranker();
		}
		return this.bm25Fallback!;
	}

	async rerank(hits: RetrievalHit[], query: string): Promise<RetrievalHit[]> {
		if (!this.isAvailable()) {
			if (this.config.fallbackToBm25) {
				return this.getBm25Fallback().rerank(hits, query);
			}
			return hits;
		}

		try {
			// Fetch embeddings for query and hits
			const [queryEmbedding, hitEmbeddings] = await Promise.all([
				this.fetchEmbedding(query),
				this.fetchHitEmbeddings(hits),
			]);

			// Calculate cosine similarities
			const similarities = hitEmbeddings.map((embedding, i) => ({
				index: i,
				similarity: this.cosineSimilarity(queryEmbedding, embedding),
			}));

			// Sort by similarity
			similarities.sort((a, b) => b.similarity - a.similarity);

			// Reorder and rescore hits
			const reranked: RetrievalHit[] = [];
			for (let i = 0; i < similarities.length; i++) {
				const { index, similarity } = similarities[i];
				reranked.push({
					...hits[index],
					score: hits[index].score * (1 - i * 0.1) + similarity * 0.5,
					context: {
						...hits[index].context,
						matchType: "semantic",
					},
				});
			}

			return reranked;
		} catch {
			if (this.config.fallbackToBm25) {
				return this.getBm25Fallback().rerank(hits, query);
			}
			throw new Error("Semantic reranking failed and fallback is disabled");
		}
	}

	private async fetchEmbedding(text: string): Promise<number[]> {
		const response = await fetch(`${this.config.endpoint!}/embeddings`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.config.apiKey}`,
			},
			body: JSON.stringify({
				model: this.config.model ?? "text-embedding-3-small",
				input: text,
			}),
		});

		if (!response.ok) {
			throw new Error(`Embedding API error: ${response.status}`);
		}

		const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
		return data.data[0]?.embedding ?? [];
	}

	private async fetchHitEmbeddings(hits: RetrievalHit[]): Promise<number[][]> {
		const texts = hits.map(hit => hit.snippet ?? hit.path);
		const embeddings: number[][] = [];

		// Batch requests
		for (let i = 0; i < texts.length; i += this.config.batchSize) {
			const batch = texts.slice(i, i + this.config.batchSize);
			const response = await fetch(`${this.config.endpoint!}/embeddings`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify({
					model: this.config.model ?? "text-embedding-3-small",
					input: batch,
				}),
			});

			if (!response.ok) {
				throw new Error(`Embedding API error: ${response.status}`);
			}

			const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
			embeddings.push(...data.data.map(d => d.embedding));
		}

		return embeddings;
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}
}
