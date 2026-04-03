import type { RetrievalHit, RetrievalSourceType } from "./types";
import { SOURCE_WEIGHTS } from "./types";

/**
 * Ranker configuration.
 */
export interface RankerConfig {
	/** Source weights for hybrid scoring */
	sourceWeights: Partial<Record<RetrievalSourceType, number>>;
	/** Whether to apply file frequency boost */
	boostFileFrequency: boolean;
	/** Minimum score threshold (0-1) */
	minScoreThreshold: number;
}

/** Default ranker configuration */
export const DEFAULT_RANKER_CONFIG: RankerConfig = {
	sourceWeights: SOURCE_WEIGHTS,
	boostFileFrequency: true,
	minScoreThreshold: 0,
};

/**
 * Ranker for scoring and sorting retrieval hits.
 */
export class Ranker {
	private config: RankerConfig;

	constructor(config: Partial<RankerConfig> = {}) {
		this.config = { ...DEFAULT_RANKER_CONFIG, ...config };
	}

	/**
	 * Rank a set of hits, applying weights and boosting.
	 */
	rank(hits: RetrievalHit[]): RetrievalHit[] {
		let ranked = [...hits];

		// Apply source weights
		ranked = this.applySourceWeights(ranked);

		// Apply file frequency boost
		if (this.config.boostFileFrequency) {
			ranked = this.boostFileFrequency(ranked);
		}

		// Filter by minimum threshold
		ranked = ranked.filter(hit => hit.score >= this.config.minScoreThreshold);

		// Sort by score descending
		ranked.sort((a, b) => b.score - a.score);

		return ranked;
	}

	/**
	 * Apply source weights to adjust scores.
	 */
	private applySourceWeights(hits: RetrievalHit[]): RetrievalHit[] {
		return hits.map(hit => ({
			...hit,
			score: hit.score * (this.config.sourceWeights[hit.source] ?? 1.0),
		}));
	}

	/**
	 * Boost hits from files with multiple matches.
	 */
	private boostFileFrequency(hits: RetrievalHit[]): RetrievalHit[] {
		// Count hits per file
		const fileCounts = new Map<string, number>();
		for (const hit of hits) {
			fileCounts.set(hit.path, (fileCounts.get(hit.path) ?? 0) + 1);
		}

		// Apply logarithmic frequency boost
		return hits.map(hit => {
			const count = fileCounts.get(hit.path) ?? 1;
			const boost = 1 + Math.log(count) * 0.1;
			return {
				...hit,
				score: hit.score * boost,
			};
		});
	}

	/**
	 * Update configuration.
	 */
	updateConfig(config: Partial<RankerConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

/**
 * Simple score normalization to [0, 1] range.
 */
export function normalizeScores(hits: RetrievalHit[]): RetrievalHit[] {
	if (hits.length === 0) return hits;

	const maxScore = Math.max(...hits.map(h => h.score));
	const minScore = Math.min(...hits.map(h => h.score));
	const range = maxScore - minScore;

	if (range === 0) {
		return hits.map(hit => ({ ...hit, score: 1.0 }));
	}

	return hits.map(hit => ({
		...hit,
		score: (hit.score - minScore) / range,
	}));
}
