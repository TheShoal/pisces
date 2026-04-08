# Pisces MCP Dogfooding Issues - 2026-04-07

Source: Shoal MCP dogfooding session (Hermes via Discord)
Related: `~/pantheon/tools/shoal-cli/issues/mcp-dogfooding-2026-04-07.md`

---

## Issue P1: No model enforcement — Shoal `model` param ignored by Pisces

**Status:** ✅ FIXED (commit `eda762cc3`)

**Problem:** Shoal's `model` parameter on `create_session` was ignored by Pisces.

**Fix:** Added `PI_MODEL` env var override in `packages/coding-agent/src/config/model-resolver.ts`. If `process.env.PI_MODEL` is set, it takes highest priority in model resolution. Purely additive — no behavior change when unset.

**Remaining Shoal side:** Shoal still needs to pass `--model` or set `PI_MODEL` env var when launching Pisces sessions. The `shoal new` CLI lacks a `--model` flag. Workaround: use templates with hardcoded model (e.g., `gemma-test`).

---

## Issue P2: Pisces edit tool corrupts files with random prefix strings

**Status:** ✅ FIXED (commit `4e334243c`)

**Problem:** Token boundary markers (2-char uppercase prefixes like `KB:`, `TR:`, `QZ:`) leaked into file content.

**Fix:**
- Added `TOKEN_LEAK_PREFIX_RE = /^[A-Z]{2}:\s/` regex in `packages/coding-agent/src/patch/index.ts`
- Added `stripTokenLeakPrefixes(lines)` function that strips when ALL non-empty lines have the prefix
- Updated `stripWriteContent()` in `write.ts` to call `stripTokenLeakPrefixes` regardless of hashline mode
- Updated `hashlineParseText()` to also strip token leak prefixes from edit content
- Same heuristic as `stripHashlinePrefixes` — only strips when all non-empty lines match, avoiding false positives

---

## Issue P3: todo_write serialization bug (token boundary leak)

**Status:** ✅ FIXED (commit `e86bb8952`)

**Problem:** Token boundary markers (`<|`, `|>`, `<|...|>`) leaked into streaming tool call arguments, corrupting JSON.

**Fix:**
- Created `packages/ai/src/sanitize-streaming-delta.ts` with `sanitizeStreamingDelta(delta: string): string`
- Strips `<|`, `|>`, and `<|...|>` patterns conservatively (only `<|` prefix, not mid-content)
- Applied in `openai-responses-shared.ts` before appending to `partialJson`
- Applied in `anthropic.ts` for `input_json_delta` events
- Applied in `openai-codex-responses.ts` for tool call argument deltas

---

## Shoal Dogfooding Issues Found During Fix Session

| Issue | Severity | Status |
|-------|----------|--------|
| Worktrees don't get `node_modules` — need auto `bun install` | High | Open |
| `shoal new` lacks `--model` flag | Medium | Open |
| Template pane commands not always applied | Medium | Open |
| Worktree creation on dirty/unmerged HEAD succeeds silently | Medium | Open |
| Free-tier rate limits cause frequent fallbacks | Low | By design |

---

## Session Context

- Shoal version: v0.39.0 → main (post dogfood-fixes merge)
- Shell: fish 4.6.0
- Terminal: tmux 3.6a
- Fix agent model: google/gemma-4-26b-a4b-it (fell back from gemma-4-31b-it:free due to rate limits)
- Fix session: `fix-p1-model-enforce` using `gemma-test` template
