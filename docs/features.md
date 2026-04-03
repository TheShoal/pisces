# Full Feature Reference

Complete reference for every major subsystem in pisces. Each entry links to the full doc for implementation details.

---

## Execution modes

### RPC mode
Run pisces as a headless subprocess. Communication is newline-delimited JSON over stdio — send `RpcCommand` objects in, receive `RpcResponse` and session events out. Supports full session lifecycle: create, prompt, steer, abort, branch, hand off, export. Designed to embed pisces inside orchestrators, CI pipelines, or other agents.

```bash
pisces --mode rpc
```

Commands include `prompt`, `steer`, `follow_up`, `abort`, `abort_and_prompt`, `new_session`, `get_state`, `set_model`, `bash`, `read_file`, `write_file`, `fork_session`, `resume_session`, `export_session`. Extension UI requests flow back through the same channel.

→ [RPC Protocol Reference](/rpc)

### SDK (in-process)
Embed directly in any Bun/Node process via `@oh-my-pi/pi-coding-agent`. `createAgentSession()` returns a fully wired session with auto-discovered extensions, skills, MCP servers, and tools. Subscribe to typed events, inject messages, control tools, and manage session state without spawning a child process.

→ [SDK Reference](/sdk)

### Interactive TUI
Full terminal UI with differential rendering, PTY overlays, inline image display, and keyboard-driven session navigation. Not the primary focus of this fork but fully functional.

→ [TUI internals](/tui-runtime-internals)

---

## Session model

### Append-only session tree
Every entry (message, tool call, tool result, compaction, branch summary) is a node with `id` and `parentId`. The tree is never rewritten — branching changes `leafId`, not the log. The full history of every branch survives.

### Branching & `/tree` navigation
`/tree` opens an interactive navigator showing all branches. Switching branches generates an automatic branch summary for the abandoned path, then replaces the active context with entries on the new path. `/branch` creates a new branch at the current leaf.

### Context compaction
When the context window fills, compaction summarises the oldest entries into a single `CompactionEntry`. The boundary (`firstKeptEntryId`) controls exactly which entries are replaced. Compaction entries are first-class session nodes, not destructive rewrites — you can navigate past them.

### `/handoff`
Generates a structured context summary for the current session, creates a new session, and injects the summary as the opening message. Use when starting a new task that benefits from a clean context but needs awareness of prior work.

### Session operations
Export, share (read-only URL), fork (branch into a new session file), and resume prior sessions. All operations preserve the full tree.

→ [Session model](/session) · [Branching & tree](/session-tree-plan) · [Compaction](/compaction) · [Operations](/session-operations-export-share-fork-resume)

---

## Time-Traveling Stream Rules (TTSR)

Rules with a `ttsrTrigger` pattern watch the model's output token-by-token. When the pattern matches mid-stream:

1. The current generation is interrupted.
2. The rule's content is injected into the context at the point of interruption.
3. The generation retries from that point with the rule already present.

Zero upfront context cost — a rule that never fires never touches the context window. Rules deduplicate by name; the highest-priority provider wins.

→ [TTSR injection lifecycle](/ttsr-injection-lifecycle)

---

## Parallel subagents

### Task tool
Dispatch a batch of named agents to run in parallel. Each task gets its own isolated session. Results stream back as the agents complete. The `context` field is prepended to every task's `assignment` — share constraints once rather than duplicating across tasks.

### Isolation backends
Set `isolated: true` on a task batch to run each agent in a git worktree. The agent operates on a real filesystem copy. When the agent finishes, pisces produces a diff patch — the parent session can apply, inspect, or discard it without touching the working tree.

### Spawn depth & agent restrictions
Each `AgentDefinition` declares which agent types it can `spawns`. The runtime enforces a maximum recursion depth — at the limit, the `task` tool is removed from the child's toolset and `spawns` is cleared. Agents cannot escape their depth budget.

### Bundled agents
`task` (general), `plan` (read-only planning), `code-reviewer`, `debug-test-failure`, `fix-pr-comments`, `upgrade-dependency`, `explore` (read-only scout), `oracle` (reasoning advisor), `librarian` (external API research), `quick_task` (mechanical updates).

→ [Task agent discovery](/task-agent-discovery)

---

## Rust-native core

All performance-critical primitives run inside a Rust N-API module (`@oh-my-pi/pi-natives`). No shelling out for search, no third-party binary dependencies.

| Capability | Details |
|---|---|
| `grep` | Regex search with `.gitignore` support, match streaming, configurable context lines |
| `glob` | Recursive glob with shared FS scan cache; cache invalidated on writes |
| `fuzzyFind` | `fd`-style fuzzy file finder |
| `pty` | Full PTY with resize, signal, raw/cooked mode |
| `shell` | Subprocess with merged stdout/stderr, cancellation, timeout |
| `highlight` | Syntax highlighting to ANSI escape sequences |
| `text` | ANSI-aware `wrapText`, `truncateToWidth`, `sliceWithWidth` |
| `image` | Decode/encode images, screenshot HTML to PNG, clipboard read/write |
| `html` | HTML-to-PNG rendering for artifact display |

The FS scan cache (`fs_cache`) is shared across `grep` and `glob` calls within a session. Directory entries are cached on first read and invalidated when the agent writes to that subtree — subsequent search calls skip `readdir` for unchanged directories.

→ [Natives architecture](/natives-architecture) · [Text/search pipeline](/natives-text-search-pipeline)

---

## Persistent IPython kernel

The `python` tool runs cells through a Jupyter Kernel Gateway rather than spawning `python -c` per call. The kernel persists for the lifetime of the session:

- Variables, imports, and in-memory state survive between tool calls.
- `reset: true` restarts the kernel before the first cell in a call.
- Rich output — DataFrames, matplotlib figures, Mermaid diagrams, HTML — renders inline in the TUI and is captured in RPC/SDK event streams.

Two gateway modes: auto-managed local gateway (started on demand) or externally configured via `PI_PYTHON_GATEWAY_URL`. The local gateway is shared across sessions on the same machine via a coordinator lock.

→ [Python runtime](/python-repl)

---

## Structured storage: blobs & artifacts

Long tool output and binary data never bloat the session JSONL:

**Content-addressed blobs** — global, keyed by SHA-256. Images and large binary payloads are stored once and referenced as `blob:sha256:<hash>`. The same image used in multiple sessions takes disk space once.

**Session artifacts** — per-session directory (named after the session file). Full tool output, subagent results, and truncated bash output are written here and referenced as `artifact://<id>`. Retrievable by any subsequent tool call in the same session.

The model sees truncated output inline and can request the full content via the `artifact://` URI when needed — context stays lean without information loss.

→ [Blob and artifact architecture](/blob-artifact-architecture)

---

## MCP integration

### Transports
Both `stdio` (subprocess) and HTTP/SSE transports are supported. The HTTP transport handles reconnect, SSE ping keepalive, and OAuth token refresh transparently.

### Fast startup gate
MCP servers connect in parallel at session start. pisces waits up to 250ms, returns `DeferredMCPTool` handles for any servers still connecting, then completes session startup without blocking on slow servers. Deferred tools resolve in the background.

### Live refresh
`/mcp` disconnects all servers, re-discovers configs, and re-registers tools into the live session — no restart required.

### Exa integration
Exa MCP servers are filtered from the standard tool list. The API key is extracted and wired into the native Exa tool instead, which uses the key directly without the MCP round-trip overhead.

→ [MCP runtime lifecycle](/mcp-runtime-lifecycle) · [Protocol & transports](/mcp-protocol-transports) · [MCP config](/mcp-config)

---

## Extension model

### Extensions (TypeScript)
A default-exported factory receives `ExtensionAPI` and can register:

- **LLM-callable tools** — TypeBox-typed, streamed results, appear in the model's tool list
- **Slash commands** — `/yourcommand [args]` routed through the input controller
- **Event handlers** — intercept `tool_call`, `tool_result`, `message`, `session_start`, and more; return `{ block: true }` to veto, mutate inputs/outputs in place
- **Custom renderers** — override how specific tool calls or message types render in the TUI
- **Session injection** — `sendMessage`, `sendUserMessage`, `appendEntry` for programmatic message injection

Extensions are hot-discovered from `~/.pisces/agent/extensions` (user) and `.pisces/extensions` (project). The factory pattern means extensions are plain TypeScript modules with no build step.

### Skills
File-backed context packs. A `SKILL.md` file is listed in the system prompt by name+description. The model reads the full content on demand via `read skill://<name>`. Skills activate just in time — no upfront token cost for skills that aren't needed.

→ [Skills](/skills)

### TTSR rules
Trigger-pattern-gated rules injected mid-stream. See [TTSR section](#time-traveling-stream-rules-ttsr) above.

### Hooks
Pre/post tool call interceptors with blocking capability. The current runtime routes hooks through the extension runner, but the hook API (`HookAPI`) remains a lighter alternative for simple intercept-only use cases.

→ [Hooks](/hooks) · [Extensions](/extensions) · [Extension loading](/extension-loading)

---

## Plugin marketplace

Install plugins from any Git-hosted catalog using the Claude plugin registry format. Plugins bundle skills, slash commands, hooks, MCP servers, and LSP servers as a unit.

```
/marketplace add anthropics/claude-plugins-official
/marketplace install wordpress.com@claude-plugins-official
```

Scopes: **user** (all projects, `~/.pisces/plugins/`) or **project** (`.pisces/installed_plugins.json`). Project-scoped plugins shadow user-scoped ones.

→ [Marketplace](/marketplace)

---

## Tool runtime details

### Bash tool
Command normalization extracts trailing `| head`/`| tail` pipes into structured limits before execution. A configurable interceptor can block commands and redirect the model to a more appropriate tool (e.g., blocking `grep` in favour of the native `grep` tool). Output is truncated to a configurable line limit; full output is written to a session artifact.

→ [Bash tool runtime](/bash-tool-runtime)

### Preview/resolve workflow
`ast_edit` and custom tools can push a `PendingAction` before committing changes. The model calls `resolve` with `action: "apply"` or `"discard"` to finalize. Pending actions form a LIFO stack — multiple preview-producing tools in a single turn resolve in reverse order.

→ [Resolve tool](/resolve-tool-runtime)

### AST-aware edit (`ast_edit`)
Structural code rewrites via ast-grep. Operates on parsed AST rather than text, so formatting differences don't affect matches. Supports multi-pattern passes, contextual `sel` mode, and language-scoped rewrites.

### Notebook tool
Execute cells in `.ipynb` files directly — edit, insert, or delete cells by index. Backed by the same IPython kernel as the `python` tool.

→ [Notebook tool](/notebook-tool-runtime)

---

## Configuration & secrets

### Settings hierarchy
Settings merge across four levels: built-in defaults → user (`~/.pisces/config.json`) → project (`.pisces/config.json`) → environment variables. Project settings are only loaded when `enableProjectConfig` is true.

### Environment & secrets
`PI_*` environment variables configure model keys, gateway URLs, and feature flags. The `secrets` subsystem manages OAuth tokens for provider authentication (Anthropic, Google, Amazon) with a pluggable storage backend.

→ [Configuration](/config-usage) · [Environment variables](/environment-variables) · [Secrets](/secrets)

---

## LSP integration

11 operations across 40+ language server configurations: `diagnostics`, `definition`, `references`, `hover`, `symbols`, `rename`, `code_actions`, `type_definition`, `implementation`, `status`, `reload`. Format-on-write via `code_actions`. Configurable per-language in project or user settings.

---

## Models

Multi-provider with automatic fallback. Supports Anthropic (Claude), Google (Gemini), Amazon Bedrock, and OpenAI-compatible endpoints. `thinkingLevel` controls extended thinking budget per agent. The `/model` command and `set_model` RPC command switch providers live.

→ [Models](/models)
