import * as path from "node:path";

import type { SymbolInformation } from "../../../lsp/types";
import { formatSymbolInformation } from "../../../lsp/utils";
import type { RetrievalHit, SearchParams } from "../types";
import type { RetrievalSource } from "./index";

/**
 * LSP source wrapper - provides semantic search via language server.
 * Normalizes LSP symbol results to RetrievalHit format.
 *
 * Note: This is a simplified implementation. Full LSP integration
 * requires the session to provide proper client access.
 */
export class LspSource implements RetrievalSource {
	readonly name = "lsp" as const;

	constructor(
		private readonly cwd: string,
		private readonly getClient?: () => Promise<LspClientWrapper | null>,
	) {}

	async search(params: SearchParams): Promise<RetrievalHit[]> {
		const { query, limit = 50 } = params;

		const pattern = query.trim();
		if (!pattern) {
			return [];
		}

		// If no client getter is provided, return empty
		if (!this.getClient) {
			return [];
		}

		// Get LSP client
		const client = await this.getClient();
		if (!client) {
			return []; // No LSP server available
		}

		// Try workspace symbols
		try {
			const symbols = await client.workspaceSymbol(query, limit);
			if (symbols && symbols.length > 0) {
				return this.normalizeSymbolInfos(symbols);
			}
		} catch {
			// LSP call failed
		}

		return [];
	}

	private normalizeSymbolInfos(symbols: SymbolInformation[]): RetrievalHit[] {
		const hits: RetrievalHit[] = [];

		for (const symbol of symbols) {
			const location = symbol.location;
			const filePath = this.uriToPath(location.uri);

			hits.push({
				path: path.relative(this.cwd, filePath).replace(/\\/g, "/") || filePath,
				line: location.range.start.line + 1,
				column: location.range.start.character + 1,
				endLine: location.range.end.line + 1,
				endColumn: location.range.end.character + 1,
				snippet: formatSymbolInformation(symbol, this.cwd),
				source: "lsp",
				score: this.scoreSymbol(symbol),
				context: {
					matchType: "semantic",
					pattern: symbol.name,
					symbolName: symbol.name,
				},
			});
		}

		return hits;
	}

	private scoreSymbol(symbol: SymbolInformation): number {
		// Boost certain symbol kinds
		const kindBoost: Record<number, number> = {
			1: 0.8, // File
			2: 0.8, // Module
			3: 1.0, // Namespace
			4: 0.9, // Package
			5: 0.95, // Class
			6: 0.9, // Method
			7: 0.9, // Property
			8: 0.85, // Field
			9: 1.0, // Constructor
			10: 0.9, // Enum
			11: 0.85, // Interface
			12: 0.9, // Function
			13: 0.85, // Variable
			14: 0.8, // Constant
			25: 0.9, // Operator
			26: 0.85, // TypeParameter
		};

		const boost = kindBoost[symbol.kind] ?? 0.8;
		const hasContainerName = symbol.containerName ? 0.05 : 0;

		return Math.min(boost + hasContainerName, 1.2);
	}

	private uriToPath(uri: string): string {
		// Simple URI to path conversion
		if (uri.startsWith("file://")) {
			return uri.slice(7);
		}
		return uri;
	}
}

/**
 * Simplified LSP client interface for workspace symbol search.
 */
export interface LspClientWrapper {
	workspaceSymbol(query: string, limit: number): Promise<SymbolInformation[]>;
}
