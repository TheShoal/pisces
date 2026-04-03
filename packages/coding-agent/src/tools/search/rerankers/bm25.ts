import type { RetrievalHit } from "../types";
import type { Reranker, RerankerConfig } from "./index";

/**
 * BM25 configuration.
 */
export interface Bm25Config extends RerankerConfig {
	/** Term frequency saturation parameter (default: 1.2) */
	k1: number;
	/** Length normalization parameter (default: 0.75) */
	b: number;
	/** Fields to index for BM25 scoring */
	fields: (keyof RetrievalHit)[];
}

/** Default BM25 configuration */
export const DEFAULT_BM25_CONFIG: Bm25Config = {
	k1: 1.2,
	b: 0.75,
	fields: ["snippet", "path"],
};

/**
 * BM25 reranker using the Okapi BM25 algorithm.
 *
 * This implements BM25 for local reranking of retrieval hits.
 * It tokenizes hit fields and calculates relevance scores.
 */
export class Bm25Reranker implements Reranker {
	private readonly config: Bm25Config;

	constructor(config: Partial<Bm25Config> = {}) {
		this.config = { ...DEFAULT_BM25_CONFIG, ...config };
	}

	/**
	 * Rerank hits using BM25 scoring.
	 */
	async rerank(hits: RetrievalHit[], query: string): Promise<RetrievalHit[]> {
		if (hits.length === 0) return hits;

		// Tokenize query
		const queryTokens = this.tokenize(query);

		// Build inverted index
		const { docFreq, docLengths, avgDocLength } = this.buildIndex(hits);

		// Calculate BM25 scores
		const scores = hits.map(hit => this.calculateScore(hit, queryTokens, docFreq, docLengths, avgDocLength));

		// Normalize scores to [0, 1]
		const maxScore = Math.max(...scores);
		const minScore = Math.min(...scores);
		const range = maxScore - minScore || 1;

		// Combine original score with BM25 score
		return hits.map((hit, i) => ({
			...hit,
			score: hit.score * 0.3 + ((scores[i] - minScore) / range) * 0.7,
			context: {
				...hit.context,
				matchType: "semantic",
			},
		}));
	}

	/**
	 * Tokenize text into terms.
	 */
	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.split(/[\s\W]+/)
			.filter(token => token.length > 1);
	}

	/**
	 * Build inverted index from documents.
	 */
	private buildIndex(hits: RetrievalHit[]): {
		docFreq: Map<string, number>;
		docLengths: Map<number, number>;
		avgDocLength: number;
	} {
		const docFreq = new Map<string, number>();
		const docLengths = new Map<number, number>();
		let totalLength = 0;

		hits.forEach((hit, docId) => {
			const terms = new Set<string>();

			// Index specified fields
			for (const field of this.config.fields) {
				const value = hit[field];
				if (typeof value === "string") {
					for (const token of this.tokenize(value)) {
						terms.add(token);
					}
				}
			}

			docLengths.set(docId, terms.size);
			totalLength += terms.size;

			terms.forEach(term => {
				docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
			});
		});

		const avgDocLength = totalLength / hits.length;

		return { docFreq, docLengths, avgDocLength };
	}

	/**
	 * Calculate BM25 score for a document.
	 */
	private calculateScore(
		hit: RetrievalHit,
		queryTokens: string[],
		docFreq: Map<string, number>,
		docLengths: Map<number, number>,
		avgDocLength: number,
	): number {
		const docId = 0; // Placeholder - we use hit directly
		const docLength = docLengths.get(docId) ?? 0;
		let score = 0;

		// Extract terms from hit
		const hitTerms = new Set<string>();
		for (const field of this.config.fields) {
			const value = hit[field];
			if (typeof value === "string") {
				for (const token of this.tokenize(value)) {
					hitTerms.add(token);
				}
			}
		}

		for (const term of queryTokens) {
			if (!hitTerms.has(term)) continue;

			const df = docFreq.get(term) ?? 0;
			if (df === 0) continue;

			// IDF component
			const idf = Math.log((hitTerms.size - df + 0.5) / (df + 0.5) + 1);

			// TF component with saturation
			const tf = 1; // Each term appears at least once
			const tfComponent =
				(tf * (this.config.k1 + 1)) /
				(tf + this.config.k1 * (1 - this.config.b + (this.config.b * docLength) / avgDocLength));

			score += idf * tfComponent;
		}

		return score;
	}
}
