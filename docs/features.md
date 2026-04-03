# Full Feature Reference

Complete reference for every major subsystem in pisces. Organised into three tiers:
- **pisces-native** — built or modified in this fork
- **oh-my-pi core** — the pi-coding-agent package
- **oh-my-pi platform** — TUI, AI, agent-core, natives, and other packages

---

## Pisces-native features

### lobster-party integration mode

`PISCES_LOBSTER_MODE=1` activates the lobster extension, injecting two additional LLM-callable tools that communicate with the majordomo-do sidecar over a Unix socket:

**`messageUser`** — sends a message directly into the user-facing lobster-party chat interface. Used by the agent to ask clarifying questions or surface status updates without polluting the session transcript.

**`memorySearch`** — queries the majordomo-do memory index for project-relevant context (technical decisions, prior conversation summaries, recurring workflows). Retrieval is scoped to the current run channel and retried up to 4 times with exponential backoff on transient socket failures.

Both tools are loaded via `CreateAgentSessionOptions.customTools` and are absent when `PISCES_LOBSTER_MODE` is unset — zero overhead in non-lobster deployments.

Environment variables:
- `PISCES_LOBSTER_MODE=1` — enable the extension
- `PISCES_MAJORDOMO_SOCKET` (or `MAJORDOMO_SOCKET`) — Unix socket path for the sidecar
- `PISCES_RUN_CHANNEL_KEY` (or `RUN_CHANNEL_KEY`) — per-run routing key

### `agent_end` session metadata

`AgentEndEvent` carries `sessionId` and `sessionFile` alongside `messages`. This lets any RPC or JSON-mode consumer extract the session file path at turn completion without parsing the session header separately — the primary hook for lobster-loop's conversation persistence model.

```json
{ "type": "agent_end", "sessionId": "abc123…", "sessionFile": "/path/to/sessions/…jsonl", "messages": […] }
```

### `--mode=json` flag fix

The upstream `--mode json` (space form) worked; `--mode=json` (equals form) silently fell back to text mode. Both forms now parse identically. Unrecognised mode values emit a loud error to stderr: `Unknown mode: <x>. Valid values: text, json, rpc, acp`.

### `--agent <name>` flag

Selects which bundled or discovered agent definition runs in print mode. Matches opencode's `--agent=<name>` interface, letting lobster-loop dispatch the `plan` agent for read-only planning turns vs the default `task` agent for execution turns.

### `--no-provider-discovery` flag

Disables automatic provider discovery from environment variables. When set, the agent only loads providers explicitly configured in `config.yml`. Required for lobster sandbox deployments where ambient `AWS_*` and `ANTHROPIC_*` variables must not override the intended provider.

### `--session-dir <path>` (wired)

Redirects session storage for the process lifetime. Lets lobster-loop point each claw sandbox at an isolated session directory without relying on `PI_CODING_AGENT_DIR` and a full config mount. The flag is parsed and wired end-to-end to `SessionManager`.

---

## oh-my-pi core (pi-coding-agent)

### Execution modes

| Mode | Flag | Use |
|---|---|---|
| Interactive TUI | (default) | Full terminal UI with PTY, inline images, keyboard nav |
| Print / single-shot | `-p` / `--print` | Send one or more prompts, stream response, exit |
| JSON event stream | `--mode json` | JSONL event stream on stdout for programmatic consumers |
| RPC | `--mode rpc` | Bidirectional JSON-RPC over stdio — full session control |
| ACP | `--mode acp` | Agent Control Protocol mode (in progress) |

Print mode emits the session header as the first JSON line. `agent_end` carries `sessionId` and `sessionFile`. Session files are durable before process exit — the persist queue drains synchronously via `sessionManager.close()` before `dispose()`.

→ [RPC Protocol Reference](/rpc)

### Session model

Every entry — user message, assistant message, tool call, tool result, compaction, branch summary — is a node in an append-only tree keyed by `id`/`parentId`. The active position is `leafId`. The log is never rewritten; branching changes the leaf pointer only.

**Navigation** — `/tree` opens an interactive tree navigator. The active branch path is highlighted; other branches show their last entry as context. Switching branches generates an automatic `BranchSummaryEntry` for the abandoned path.

**Compaction** — when the context window fills, the oldest entries are summarised into a `CompactionEntry` with a configurable `firstKeptEntryId` boundary. Compaction entries are first-class nodes — the full pre-compaction history is never deleted.

**`/handoff`** — generates a structured context summary, creates a new session, and injects the summary as the opening system message. Useful for a clean context start that still carries forward project state.

**Session operations** — export (HTML/markdown), share (read-only link), fork (new session file at current leaf), resume (by session ID or `--continue` for the latest).

→ [Session model](/session) · [Session tree](/session-tree-plan) · [Compaction](/compaction) · [Operations](/session-operations-export-share-fork-resume)

### Time-Traveling Stream Rules (TTSR)

Rules with a `ttsrTrigger` pattern watch the model's token stream. When the pattern matches mid-stream, the generation is interrupted, the rule content is injected at the interruption point, and the generation retries. Rules that never match cost zero tokens. Deduplicated by name; higher-priority provider wins.

→ [TTSR injection lifecycle](/ttsr-injection-lifecycle)

### Parallel subagents

The `task` tool dispatches a typed batch of named agents in parallel, each in its own isolated session. `isolated: true` runs agents in git worktrees and returns diff patches. Spawn depth is enforced — at the limit, the `task` tool is removed from the child's toolset.

**Bundled agents:** `task`, `plan` (read-only), `code-reviewer`, `debug-test-failure`, `fix-pr-comments`, `upgrade-dependency`, `explore`, `oracle`, `librarian`, `quick_task`.

→ [Task agent discovery](/task-agent-discovery)

### Persistent IPython kernel

The `python` tool runs cells through a Jupyter Kernel Gateway. The kernel persists across calls; variables, imports, and state survive between turns. `reset: true` restarts the kernel before the first cell in a call. Rich output — DataFrames, matplotlib figures, Mermaid diagrams, HTML — renders inline. Local gateway auto-starts on demand and is shared across sessions via a coordinator lock.

→ [Python runtime](/python-repl)

### Structured storage: blobs & artifacts

Large outputs and binary data are stored outside the session JSONL:

- **Content-addressed blobs** (`blob:sha256:<hash>`) — global, deduplicated. The same image across multiple sessions is stored once.
- **Session artifacts** — per-session directory. Full tool output and subagent results referenced via `artifact://` URIs. The model requests full content on demand; context stays lean.

→ [Blob and artifact architecture](/blob-artifact-architecture)

### MCP integration

Supports `stdio` and HTTP/SSE transports. Servers connect in parallel at session start with a 250ms fast-startup gate — `DeferredMCPTool` handles are returned for slow servers and resolve in the background. Live refresh via `/mcp` without restart. Exa servers are filtered and their API key is wired to the native Exa tool directly.

→ [MCP runtime lifecycle](/mcp-runtime-lifecycle) · [Protocol & transports](/mcp-protocol-transports) · [MCP config](/mcp-config)

### Extension model

A default-exported TypeScript factory receives `ExtensionAPI` and can register LLM-callable tools, slash commands, keyboard shortcuts, event interceptors (with blocking), and custom TUI renderers. Hot-discovered from `~/.pisces/agent/extensions` and `.pisces/extensions`. Gemini-format `gemini-extension.json` manifests are also supported.

→ [Extensions](/extensions) · [Extension loading](/extension-loading) · [Gemini manifest extensions](/gemini-manifest-extensions)

### Skills

File-backed context packs (`SKILL.md`). Listed in the system prompt by name+description only. Full content is fetched on demand via `read skill://<name>`. Zero upfront token cost for skills that don't fire.

→ [Skills](/skills)

### Hooks

Pre/post tool call interceptors with blocking capability. `HookAPI` is a lighter alternative to extensions for intercept-only use cases. Currently routed through the extension runner in the default CLI startup path.

→ [Hooks](/hooks)

### Plugin marketplace

Install plugins from any Git-hosted catalog in the Claude plugin registry format. Plugins bundle skills, commands, hooks, MCP servers, and LSP server configs as a unit. User scope (`~/.pisces/plugins/`) and project scope (`.pisces/installed_plugins.json`); project scope shadows user scope.

→ [Marketplace](/marketplace)

### Autonomous memory

When enabled, a background pipeline extracts durable knowledge from past sessions and injects a compact summary at each new session start. Phase 1 extracts per-session signal (decisions, constraints, resolved failures); phase 2 consolidates into `MEMORY.md`, `memory_summary.md`, and generated skill playbooks. Retrievable via `memory://root`, `memory://root/MEMORY.md`, and `memory://root/skills/<name>/SKILL.md`.

→ [Memory](/memory)

### Tool runtime details

**Bash** — command normalization extracts trailing `| head`/`| tail` into structured limits. An interceptor can block commands and redirect the model to the appropriate tool. Full output is written to a session artifact; truncated output shown inline.

**Preview/resolve** — `ast_edit` and custom tools push a `PendingAction` before committing. The model calls `resolve(action: "apply" | "discard")` to finalize. Actions form a LIFO stack.

**AST-aware edit** — structural rewrites via ast-grep. Matches AST structure, not text; formatting differences are ignored. Multi-pattern passes, contextual `sel` mode, language-scoped rewrites.

**Notebook** — edit, insert, or delete cells in `.ipynb` files by index, backed by the same IPython kernel.

→ [Bash tool](/bash-tool-runtime) · [Resolve tool](/resolve-tool-runtime) · [Notebook tool](/notebook-tool-runtime) · [Custom tools](/custom-tools)

### Slash commands

Discovered from four providers (`native` → `claude` → `claude-plugins` → `codex`) with priority-ordered deduplication. Commands from higher-priority providers shadow same-named commands from lower ones. Extensions register additional commands at load time.

Built-in commands include `/tree`, `/branch`, `/handoff`, `/new`, `/fork`, `/resume`, `/continue`, `/model`, `/mcp`, `/memory`, `/marketplace`, `/settings`, `/skill:<name>`, `/export`, `/clear`, `/help`.

→ [Slash command internals](/slash-command-internals)

### Configuration

Settings merge across four levels: built-ins → user (`~/.pisces/config.json`) → project (`.pisces/config.json`) → env vars. Config roots scanned in order: `.pisces`, `.claude`, `.codex`, `.gemini`. Project settings gated by `enableProjectConfig`.

→ [Configuration](/config-usage) · [Environment variables](/environment-variables) · [Secrets](/secrets)

### Models & providers

Built-in support for Anthropic (Claude), Google (Gemini), Amazon (Bedrock), OpenAI-compatible endpoints, Azure OpenAI, Groq, Cerebras, xAI, OpenRouter, Kilo, Mistral, z.ai. Provider-level `baseUrl`, `apiKey`, `headers`, and `modelOverrides` are configurable in `models.yml`. `thinkingLevel` controls extended thinking budget per agent. Model roles (`initial`, `smol`, `slow`) separate heavy and lightweight model assignments.

→ [Models](/models)

### LSP integration

11 operations: `diagnostics`, `definition`, `references`, `hover`, `symbols`, `rename`, `code_actions`, `type_definition`, `implementation`, `status`, `reload`. 40+ language server configurations built in. Format-on-write via `code_actions`. Disable per-session with `--no-lsp`.

---

## oh-my-pi platform packages

### `@oh-my-pi/pi-ai` — multi-provider streaming

Unified `AssistantMessageEvent` stream across all providers. Every provider normalises to the same event sequence: `start` → content block triplets (`text_start/delta/end`, `thinking_start/delta/end`, `toolcall_start/delta/end`) → terminal `done` or `error`. Delta events are throttled (~50ms batches) before delivery to consumers — TUI and event subscribers see smooth updates regardless of provider stream frequency.

Extended thinking (Anthropic) and structured output (OpenAI responses API) are handled at the provider layer and exposed as first-class events.

→ [Provider streaming internals](/provider-streaming-internals)

### `@oh-my-pi/pi-tui` — differential terminal renderer

Custom terminal UI engine with differential rendering (only changed lines are redrawn), PTY overlays, inline image display (Kitty/iTerm2 protocols), focus management, and cursor marker-based hardware cursor placement. Components implement a simple `render(width): string[]` / `handleInput(data)` contract with no framework dependency.

Theme system drives all color tokens, markdown styling, syntax highlighting palettes, and symbol presets (unicode/nerd/ascii) from a single validated JSON config.

→ [TUI](/tui) · [TUI runtime internals](/tui-runtime-internals) · [Theme](/theme)

### `@oh-my-pi/pi-natives` — Rust N-API core

All performance-critical primitives in a single Rust N-API module. No shelling out.

| Capability | Implementation |
|---|---|
| `grep` | Regex search with `.gitignore`, match streaming, context lines |
| `glob` | Recursive glob with shared FS scan cache |
| `fuzzyFind` | `fd`-style fuzzy file finder |
| `pty` | Full PTY — resize, signal, raw/cooked mode |
| `shell` | Subprocess with merged stdout/stderr, cancellation, timeout |
| `highlight` | Syntax highlighting to ANSI escape sequences |
| `text` | `wrapAnsi`, `truncateToWidth`, `sliceWithWidth` — ANSI-aware |
| `image` | Decode/encode, screenshot HTML→PNG |
| `clipboard` | Read/write system clipboard |

The FS scan cache (`fs_cache`) is shared across `grep` and `glob`. Directory entries are cached on first read and invalidated when the agent writes to that subtree — subsequent calls skip `readdir` for unchanged directories.

→ [Natives architecture](/natives-architecture) · [Text/search pipeline](/natives-text-search-pipeline) · [Shell/PTY](/natives-shell-pty-process)

### `@oh-my-pi/pi-agent` — agent loop

The core turn loop: build context → call LLM → process tool calls → repeat. Handles tool dispatch, parallel tool execution, result collection, and turn-level abort. Emits typed events (`message_update`, `tool_call`, `tool_result`, `turn_end`, `agent_end`) that `AgentSession` consumes for persistence, TTSR, compaction, and extension hooks.

### `@oh-my-pi/pi-sdk` (AI SDK layer)

Lowest-level provider abstraction. `streamSimple()` maps generic options to the correct provider stream function and returns an `AssistantMessageEventStream`. Handles authentication, base URL overrides, and provider-specific header injection.

---

## Configuration discovery across ecosystems

pisces reads capability items (skills, extensions, hooks, tools, MCP servers, slash commands, context files) from **five** config root ecosystems in priority order:

| Priority | Root | Source |
|---|---|---|
| 100 | `~/.pisces/agent/`, `.pisces/` | native |
| 80 | `~/.claude/`, `.claude/` | claude |
| 70 | `~/.codex/`, `.codex/` | codex |
| 70 | `~/.gemini/`, `.gemini/` | gemini |
| 60 | plugins directory | claude-plugins |

This means any skill, hook, extension, or MCP server installed for Claude Code or Codex is automatically available in pisces at the appropriate priority level. pisces-native config always wins on name collisions.
