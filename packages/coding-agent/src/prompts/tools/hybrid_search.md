# Hybrid Search Tool

Unified retrieval across multiple search sources with provenance tracking.

## Features
- **Multi-source search**: Combines grep (text), ast_grep (structural), and LSP (semantic) sources
- **Result provenance**: Each hit tracks which source found it and how it matched
- **Deduplication**: Automatic merging of results from different sources
- **BM25 reranking**: Optional statistical reranking for improved relevance
- **Configurable modes**: text, structural, semantic, or hybrid (all sources)

## Query Modes

|Mode|Sources|Use Case|
|---|---|---|
|`text`|grep|Fast regex matching over file content|
|`structural`|ast_grep|AST-aware structural pattern matching|
|`semantic`|LSP|Symbol definitions, references, workspace symbols|
|`hybrid`|All|Best coverage - default mode|

## Parameters

|Parameter|Type|Required|Description|
|---|---|---|---|
|`query`|string|Yes|Search query|
|`mode`|enum|No|Search mode (default: hybrid)|
|`path`|string|No|File or directory to search|
|`glob`|string|No|Glob pattern filter|
|`lang`|string|No|Language for structural search|
|`rerank`|boolean|No|Enable BM25 reranking|
|`limit`|number|No|Max results (default: 50)|
|`i`|boolean|No|Case-insensitive search|
|`multiline`|boolean|No|Enable multiline matching|
|`context`|number|No|Context lines around matches|

## Output Format

```json
{
  "hits": [
    {
      "path": "src/utils/helper.ts",
      "line": 42,
      "source": "grep",
      "score": 0.95,
      "snippet": "export function helper() {"
    }
  ],
  "fileCount": 3,
  "truncated": false,
  "sourceStats": {
    "grep": { "count": 5, "score": 0.9 },
    "ast_grep": { "count": 2, "score": 1.1 },
    "lsp": { "count": 1, "score": 1.3 }
  }
}
```

## Source Weights

Sources have different trust levels based on precision:

|Source|Weight|Rationale|
|---|---|---|
|LSP|1.2|Highest precision - semantic understanding|
|ast_grep|1.0|Structural matches - reliable|
|grep|0.9|Text matches - may include false positives|
|semantic|0.8|Embedding-based - experimental|

## Best Practices
1. **Start with hybrid mode** for comprehensive results
2. **Use mode-specific searches** when you know what you're looking for:
   - `text` for regex patterns
   - `structural` for AST-aware queries
   - `semantic` for symbol navigation
3. **Enable reranking** for improved relevance on large result sets
4. **Use path/glob filters** to narrow scope for faster searches
