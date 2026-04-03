import { describe, expect, test } from "bun:test";
import { applySourceWeights, boostFileFrequency, calculateSourceStats, mergeHits } from "./merger";
import type { RetrievalHit } from "./types";

describe("mergeHits", () => {
	test("returns empty result for empty hits", () => {
		const result = mergeHits([], 50);

		expect(result.hits).toHaveLength(0);
		expect(result.truncated).toBe(false);
		expect(result.fileCount).toBe(0);
	});

	test("keeps all hits when under limit", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", line: 1, source: "grep", score: 1.0 },
			{ path: "b.ts", line: 2, source: "grep", score: 0.9 },
		];

		const result = mergeHits(hits, 50);

		expect(result.hits).toHaveLength(2);
		expect(result.truncated).toBe(false);
	});

	test("deduplicates hits at same location", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", line: 1, source: "grep", score: 1.0 },
			{ path: "a.ts", line: 1, source: "ast_grep", score: 1.2 },
		];

		const result = mergeHits(hits, 50);

		expect(result.hits).toHaveLength(1);
		// Should keep the higher-scoring hit
		expect(result.hits[0].source).toBe("ast_grep");
	});

	test("sorts hits by score descending", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", line: 1, source: "grep", score: 0.5 },
			{ path: "b.ts", line: 2, source: "grep", score: 1.0 },
			{ path: "c.ts", line: 3, source: "grep", score: 0.8 },
		];

		const result = mergeHits(hits, 50);

		expect(result.hits[0].path).toBe("b.ts");
		expect(result.hits[1].path).toBe("c.ts");
		expect(result.hits[2].path).toBe("a.ts");
	});

	test("truncates when over limit", () => {
		const hits: RetrievalHit[] = Array.from({ length: 100 }, (_, i) => ({
			path: `file${i}.ts`,
			line: i,
			source: "grep" as const,
			score: 1.0 - i * 0.01,
		}));

		const result = mergeHits(hits, 10);

		expect(result.hits).toHaveLength(10);
		expect(result.truncated).toBe(true);
	});
});

describe("calculateSourceStats", () => {
	test("returns zeros for empty hits", () => {
		const stats = calculateSourceStats([]);

		expect(stats.grep.count).toBe(0);
		expect(stats.ast_grep.count).toBe(0);
		expect(stats.lsp.count).toBe(0);
		expect(stats.semantic.count).toBe(0);
	});

	test("counts hits per source", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 1.0 },
			{ path: "b.ts", source: "grep", score: 0.9 },
			{ path: "c.ts", source: "ast_grep", score: 1.0 },
			{ path: "d.ts", source: "lsp", score: 1.2 },
		];

		const stats = calculateSourceStats(hits);

		expect(stats.grep.count).toBe(2);
		expect(stats.ast_grep.count).toBe(1);
		expect(stats.lsp.count).toBe(1);
	});

	test("calculates average scores", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 1.0 },
			{ path: "b.ts", source: "grep", score: 0.5 },
		];

		const stats = calculateSourceStats(hits);

		expect(stats.grep.score).toBe(0.75);
	});
});

describe("applySourceWeights", () => {
	test("applies custom weights", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 1.0 },
			{ path: "b.ts", source: "lsp", score: 1.0 },
		];

		const weights = { grep: 0.5, lsp: 2.0 };
		const result = applySourceWeights(hits, weights);

		expect(result[0].score).toBe(0.5); // grep * 0.5
		expect(result[1].score).toBe(2.0); // lsp * 2.0
	});
});

describe("boostFileFrequency", () => {
	test("boosts files with multiple matches", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", line: 1, source: "grep", score: 1.0 },
			{ path: "a.ts", line: 5, source: "grep", score: 1.0 },
			{ path: "b.ts", line: 1, source: "grep", score: 1.0 },
		];

		const result = boostFileFrequency(hits);

		// a.ts has 2 matches, b.ts has 1
		// Boost should favor a.ts
		const aScore = result.find(h => h.path === "a.ts")!.score;
		const bScore = result.find(h => h.path === "b.ts")!.score;
		expect(aScore).toBeGreaterThan(bScore);
	});
});
