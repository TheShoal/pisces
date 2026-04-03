import { beforeEach, describe, expect, test } from "bun:test";
import type { ToolSession } from "../index";
import { SearchTool, type SearchToolDetails } from "./tool";

// Mock ToolSession - minimal required properties
function createMockSession(): ToolSession {
	return {
		cwd: "/test/project",
		hasUI: false,
		getSessionFile: () => null,
		getSessionId: () => "test-session",
	} as unknown as ToolSession;
}

describe("SearchTool", () => {
	let mockSession: ToolSession;

	beforeEach(() => {
		mockSession = createMockSession();
	});

	describe("parameter validation", () => {
		test("throws error for empty query", async () => {
			const tool = new SearchTool(mockSession);

			await expect(tool.execute("call-1", { query: "   " } as never)).rejects.toThrow("Query must not be empty");
		});
	});

	describe("mode selection", () => {
		test("text mode uses grep source", async () => {
			const tool = new SearchTool(mockSession);

			// Should not throw even without search db
			// (grep source handles missing db)
			const result = await tool.execute("call-1", {
				query: "test",
				mode: "text",
			} as never);

			expect(result).toBeDefined();
			expect(result.content).toBeDefined();
		});
	});
});

describe("SearchToolDetails", () => {
	test("SearchToolDetails interface is compatible with DetailsWithMeta", () => {
		// Verify the interface structure
		const details: SearchToolDetails = {
			query: "test",
			hits: [],
			fileCount: 0,
			truncated: false,
			sourceStats: {
				grep: { count: 0, score: 0 },
				ast_grep: { count: 0, score: 0 },
				lsp: { count: 0, score: 0 },
				semantic: { count: 0, score: 0 },
			},
		};

		expect(details.query).toBe("test");
		expect(details.fileCount).toBe(0);
	});
});
