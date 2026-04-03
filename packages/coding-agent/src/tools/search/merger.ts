import type { RetrievalHit, RetrievalSourceType, SearchResult, SourceStats } from "./types";

/**
 * Deduplicate and merge hits from multiple sources.
 *
 * Key logic:
 * 1. Group by path:line to identify duplicates
 * 2. Keep highest-scoring hit when duplicates exist
 * 3. Aggregate file match counts for ranking boost
 * 4. Calculate source statistics
 */
export function mergeHits(hits: RetrievalHit[], limit: number = 50): SearchResult {
	// Group by path:line for deduplication
	const hitGroups = new Map<string, RetrievalHit[]>();

	for (const hit of hits) {
		const key = createHitKey(hit);
		if (!hitGroups.has(key)) {
			hitGroups.set(key, []);
		}
		hitGroups.get(key)!.push(hit);
	}

	// Deduplicate - keep highest score per location
	const deduplicatedHits: RetrievalHit[] = [];
	const fileMatchCounts = new Map<string, number>();

	for (const group of hitGroups.values()) {
		// Sort by score descending
		group.sort((a, b) => b.score - a.score);
		const best = { ...group[0] };

		// Aggregate file match count
		const fileCount = fileMatchCounts.get(best.path) ?? 0;
		fileMatchCounts.set(best.path, fileCount + 1);

		// Track source diversity in context
		const sources = [...new Set(group.map(h => h.source))];
		best.context = {
			...best.context,
			fileMatchCount: group.length,
			totalFileCount: sources.length,
		};

		deduplicatedHits.push(best);
	}

	// Sort by score descending
	deduplicatedHits.sort((a, b) => b.score - a.score);

	// Truncate to limit
	const truncated = deduplicatedHits.length > limit;
	const finalHits = deduplicatedHits.slice(0, limit);

	// Calculate source stats
	const sourceStats = calculateSourceStats(finalHits);

	// Get unique file count
	const fileCount = new Set(finalHits.map(h => h.path)).size;

	return {
		hits: finalHits,
		sourceStats,
		truncated,
		fileCount,
	};
}

/**
 * Create a unique key for a hit based on location.
 * Format: "path:line[:column]"
 */
function createHitKey(hit: RetrievalHit): string {
	const parts = [hit.path, String(hit.line ?? 0)];
	if (hit.column !== undefined) {
		parts.push(String(hit.column));
	}
	return parts.join(":");
}

/**
 * Calculate statistics per source.
 */
export function calculateSourceStats(hits: RetrievalHit[]): SourceStats {
	const stats: SourceStats = {
		grep: { count: 0, score: 0 },
		ast_grep: { count: 0, score: 0 },
		lsp: { count: 0, score: 0 },
		semantic: { count: 0, score: 0 },
	};

	for (const hit of hits) {
		const source = hit.source as RetrievalSourceType;
		if (source in stats) {
			stats[source].count++;
			stats[source].score += hit.score;
		}
	}

	// Calculate average scores
	for (const source of Object.keys(stats) as RetrievalSourceType[]) {
		if (stats[source].count > 0) {
			stats[source].score /= stats[source].count;
		}
	}

	return stats;
}

/**
 * Apply source weights to hit scores.
 * Higher weight = more trusted source.
 */
export function applySourceWeights(
	hits: RetrievalHit[],
	weights: Partial<Record<RetrievalSourceType, number>>,
): RetrievalHit[] {
	const defaultWeights: Record<RetrievalSourceType, number> = {
		grep: 1.0,
		ast_grep: 1.0,
		lsp: 1.0,
		semantic: 1.0,
	};

	return hits.map(hit => ({
		...hit,
		score: hit.score * (weights[hit.source] ?? defaultWeights[hit.source]),
	}));
}

/**
 * Boost hits from files with multiple matches.
 * Files that appear multiple times in results are likely more relevant.
 */
export function boostFileFrequency(hits: RetrievalHit[]): RetrievalHit[] {
	// Count hits per file
	const fileCounts = new Map<string, number>();
	for (const hit of hits) {
		fileCounts.set(hit.path, (fileCounts.get(hit.path) ?? 0) + 1);
	}

	// Apply frequency boost (logarithmic to avoid extreme boosts)
	return hits.map(hit => {
		const count = fileCounts.get(hit.path) ?? 1;
		const boost = 1 + Math.log(count) * 0.1; // 10% boost per additional match, capped by log
		return {
			...hit,
			score: hit.score * boost,
		};
	});
}
