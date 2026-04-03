import type { SearchDb } from "@oh-my-pi/pi-natives";
import type { RetrievalHit, SearchParams } from "../types";
import { AstGrepSource } from "./ast-grep";
import { GrepSource } from "./grep";
import { type LspClientWrapper, LspSource } from "./lsp";

/**
 * Retrieval source interface.
 * Each source wraps a specific search mechanism and returns normalized hits.
 */
export interface RetrievalSource {
	/** Source identifier */
	readonly name: string;

	/** Execute search and return normalized hits */
	search(params: SearchParams): Promise<RetrievalHit[]>;
}

/** Source registry for creating source instances */
export interface SourceRegistry {
	/** Create a grep source instance */
	createGrepSource(searchDb?: SearchDb): RetrievalSource;
	/** Create an ast-grep source instance */
	createAstGrepSource(signal?: AbortSignal): RetrievalSource;
	/** Create an LSP source instance */
	createLspSource(getClient: () => Promise<LspClientWrapper | null>): RetrievalSource;
}

/** Default source registry implementation */
export function createSourceRegistry(cwd: string): SourceRegistry {
	return {
		createGrepSource: (searchDb?: SearchDb) => new GrepSource(cwd, searchDb),
		createAstGrepSource: (signal?: AbortSignal) => new AstGrepSource(cwd, signal),
		createLspSource: (getClient: () => Promise<LspClientWrapper | null>) => new LspSource(cwd, getClient),
	};
}

/** Get sources for a given search mode */
export function getSourcesForMode(
	mode: "text" | "structural" | "semantic" | "hybrid",
	registry: SourceRegistry,
	context: {
		searchDb?: SearchDb;
		lspClientGetter?: () => Promise<LspClientWrapper | null>;
		signal?: AbortSignal;
	},
): RetrievalSource[] {
	switch (mode) {
		case "text":
			return [registry.createGrepSource(context.searchDb)];
		case "structural":
			return [registry.createAstGrepSource(context.signal)];
		case "semantic":
			if (context.lspClientGetter) {
				return [registry.createLspSource(context.lspClientGetter)];
			}
			return [];
		default: {
			const sources: RetrievalSource[] = [
				registry.createGrepSource(context.searchDb),
				registry.createAstGrepSource(context.signal),
			];
			if (context.lspClientGetter) {
				sources.push(registry.createLspSource(context.lspClientGetter));
			}
			return sources;
		}
	}
}

export { AstGrepSource } from "./ast-grep";
export { GrepSource } from "./grep";
export { LspSource } from "./lsp";
