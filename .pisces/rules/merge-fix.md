---
description: Fix remaining TypeScript errors after upstream merge at 2b7fe3ba2
alwaysApply: true
Status: COMPLETE (Historical Reference Only)
---

# Merge Type Error Fix Task

## Already Fixed (DO NOT TOUCH)
- discovery/builtin.ts — parseFrontmatter import moved to @oh-my-pi/pi-utils
- config/settings.ts — parsePath() restored
- session/agent-session.ts — AgentEndEvent import, agent_end emit, displayEvent type, #sessionManager fix
- session/session-manager.ts — public getters for sessionId/sessionFile
- config/settings-schema.ts — 12 Pisces settings keys added
- sdk.ts — extraMcpServers added to CreateAgentSessionOptions

## Remaining Issues

1. **task/index.ts** — Remove duplicate `prompt` import from line 23 (it's already imported from @oh-my-pi/pi-utils on line 19). Replace 3 `expandPromptTemplate(template, { data })` calls (~lines 395, 434, 1728) with `prompt.render(template, { data })` since upstream changed expandPromptTemplate's signature to take PromptTemplate[] not a data object.

2. **packages/ai/src/stream.ts line 147** — Duplicate key in serviceProviderMap object literal. Find and remove the duplicate.

3. **tools/search/sources/grep.ts line 74** — Replace `mode: "content"` with `GrepOutputMode.Content` (import GrepOutputMode from @oh-my-pi/pi-natives).

4. **commit/agentic/agent.ts line 134** — Add `args: undefined` to fallback object: `?? { name: event.toolName, args: undefined }`.

5. **modes/controllers/event-controller.ts** — Fix implicit any params (~line 136, 160) and undefined value issues (~lines 168, 170, 178, 227, 243, 249, 251, 253, 255, 259, 260). Add null guards or non-null assertions.

6. **task/executor.ts line 62** — Type predicate not assignable to parameter type.

7. **telemetry/otel-adapter.ts line 235** — Add explicit type to parameter 'r'.

8. **test file event-controller-idle-compaction.test.ts line 73** — Add sessionId and sessionFile to agent_end event shape.

## Verification
Run `bun run --bun tsc --noEmit` — must have zero errors.
