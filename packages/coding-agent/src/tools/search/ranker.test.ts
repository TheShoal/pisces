import { describe, expect, test } from "bun:test";
import { normalizeScores, Ranker } from "./ranker";
import type { RetrievalHit } from "./types";

describe("Ranker", () => {
	test("ranks hits by score descending", () => {
		const ranker = new Ranker();
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 0.5 },
			{ path: "b.ts", source: "grep", score: 1.0 },
			{ path: "c.ts", source: "grep", score: 0.8 },
		];

		const result = ranker.rank(hits);

		expect(result[0].path).toBe("b.ts");
		expect(result[1].path).toBe("c.ts");
		expect(result[2].path).toBe("a.ts");
	});

	test("applies source weights", () => {
		const ranker = new Ranker({
			sourceWeights: { grep: 0.5, lsp: 2.0 },
		});
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 1.0 },
			{ path: "b.ts", source: "lsp", score: 1.0 },
		];

		const result = ranker.rank(hits);

		// lsp should be ranked first due to higher weight
		expect(result[0].source).toBe("lsp");
		expect(result[1].source).toBe("grep");
	});

	test("boosts file frequency", () => {
		const ranker = new Ranker({ boostFileFrequency: true });
		const hits: RetrievalHit[] = [
			{ path: "a.ts", line: 1, source: "grep", score: 1.0 },
			{ path: "a.ts", line: 5, source: "grep", score: 1.0 },
			{ path: "b.ts", line: 1, source: "grep", score: 1.0 },
		];

		const result = ranker.rank(hits);

		// a.ts should be ranked first due to frequency boost
		expect(result[0].path).toBe("a.ts");
	});

	test("filters by minimum score threshold", () => {
		const ranker = new Ranker({ minScoreThreshold: 0.8 });
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 1.0 },
			{ path: "b.ts", source: "grep", score: 0.5 },
			{ path: "c.ts", source: "grep", score: 0.9 },
		];

		const result = ranker.rank(hits);

		expect(result).toHaveLength(2);
		expect(result.find(h => h.path === "b.ts")).toBeUndefined();
	});
});

describe("normalizeScores", () => {
	test("normalizes scores to 0-1 range", () => {
		const hits: RetrievalHit[] = [
			{ path: "a.ts", source: "grep", score: 10.0 },
			{ path: "b.ts", source: "grep", score: 20.0 },
			{ path: "c.ts", source: "grep", score: 15.0 },
		];

		const result = normalizeScores(hits);

		expect(result[0].score).toBe(0.0); // min
		expect(result[1].score).toBe(1.0); // max
		expect(result[2].score).toBe(0.5); // middle
	});

	test("handles empty array", () => {
		const result = normalizeScores([]);
		expect(result).toHaveLength(0);
	});

	test("handles single hit", () => {
		const hits: RetrievalHit[] = [{ path: "a.ts", source: "grep", score: 5.0 }];
		const result = normalizeScores(hits);
		expect(result[0].score).toBe(1.0);
	});
});
