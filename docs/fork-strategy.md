# Fork Strategy — Two-Track Model

> Last updated: 2026-04-08
> Status: Active policy

## TL;DR

Pisces follows a **Two-Track Model**: keep internal `@oh-my-pi/*` package names to preserve upstream merge compatibility, while publishing externally as `@pisces/*` via a re-export shim. This gives us both the terminal UX from upstream *and* our server/headless additions, without forcing a choice between standalone and upstream-synced.

---

## Fork Chain

```
badlogic/pi-mono (33.2K ★, 3.7K forks)
  └─ can1357/oh-my-pi (2.8K ★, 250 forks)  ← our upstream
       └─ TheShoal/pisces (0 ★, 0 forks)    ← this repo
```

| Repo | Stars | Version | Pace | Focus |
|------|------:|---------|------|-------|
| `badlogic/pi-mono` | 33,177 | v0.65.2 | ~2 releases/week | Agent toolkit, CLI, TUI |
| `can1357/oh-my-pi` | 2,759 | v14.0.1 | ~3 releases/week | Terminal-first coding agent |
|| `TheShoal/pisces` | 0 | v14.0.1 | Ad hoc | Headless/server + Shoal orchestration |

Pisces is **N commits behind** oh-my-pi's `main` (check `git rev-list --count HEAD..upstream/main`) as of 2026-04-08 (oh-my-pi ships fast — 3+ releases/week with breaking refactors in v14.x).

---

## What Pisces Adds (Pisces-Only Code)

These modules do **not exist upstream** and will never conflict:

| Module | Files | Lines | Purpose |
|--------|------:|------:|---------|
|| `shoal/` | 7 | 1,709* | Shoal multi-agent orchestration (Phases 0–5) |
|| `task/` | 15 | 7,359* | Verified isolated task execution (15 files vs upstream's 3) |
|| `session/` | 19 | 14,532* | Session inspector, replay, lifecycle management |
|| `budget/` | 3 | 257* | Wall-time budget enforcement |
|| `telemetry/` | 4 | 556* | OTLP telemetry bridge, O(1) turn-span tracking |
|| `lobster/` | 2 | 157* | lobster-party extension API |
|| **Total** | **50** | **~24,570*** | **~14% of 178K-line codebase** |

*Line counts are approximate and should be re-verified after major merges.

Upstream has a basic `task/` (3 files: agents, commands, discovery). Ours extends it with isolation backends, verification, worktree management, parallel execution, and output management. The conflict surface is the `index.ts` entry point where both add task wiring.

---

## What We Share with Upstream

The TypeScript agent loop, TUI, tool implementations, MCP stack, bundled agents, LSP integration, Python kernel, and all 10 `@oh-my-pi/*` packages flow from upstream. We consume their terminal UX as-is.

### Merge Conflict Surface (Tested 2026-04-08)

A test merge against `upstream/main` (v14.0.1) produced **9 conflicts** in 763 changed files:

| Conflicted File | Conflict Type | Resolution Difficulty |
|----------------|---------------|----------------------|
| `bun.lock` | Auto-generated | Trivial — regenerate |
| `packages/coding-agent/CHANGELOG.md` | Append-only | Trivial — concatenate |
| `docs/porting-to-natives.md` | Documentation | Easy — manual merge |
| `packages/coding-agent/src/discovery/builtin.ts` | Pisces added Claude discovery | Medium — additive |
| `packages/coding-agent/src/main.ts` | Pisces added task/shoal/budget init | Medium — additive |
| `packages/coding-agent/src/sdk.ts` | Pisces added budget/telemetry exports | Medium — additive |
| `packages/coding-agent/src/session/agent-session.ts` | Pisces added telemetry hooks | Medium — interleaved |
| `packages/coding-agent/src/task/index.ts` | Both added task features | **Hard** — convergent evolution |
| `packages/coding-agent/src/tools/index.ts` | Pisces added hybrid_search | Easy — additive |

**Most conflicts are additive** — Pisces adds imports and initialization alongside upstream changes. The only hard conflict is `task/index.ts` where both projects evolved the same module independently.

---

## The Two-Track Model

### Track 1: `pisces` (Product Layer)

What users see and install:

- **Binary**: `pisces` (also `omp` for compatibility)
- **Config dir**: `~/.pisces/` (also `.omp/` for compatibility)
- **NPM package**: `@pisces/coding-agent` (re-export shim, see below)
- **Features**: Shoal orchestration, verified tasks, budget enforcement, session inspector, lobster integration
- **Branding**: Pisces zodiac icon, separate docs site

### Track 2: `@oh-my-pi/*` (Core Layer)

Internal packages that stay on upstream's namespace:

- `@oh-my-pi/pi-ai` — Multi-provider LLM client
- `@oh-my-pi/pi-agent-core` — Agent runtime
- `@oh-my-pi/pi-tui` — Terminal UI
- `@oh-my-pi/pi-natives` — Rust native bindings
- `@oh-my-pi/pi-utils` — Shared utilities
- `@oh-my-pi/pi-coding-agent` — CLI application (shared base)

**Why keep `@oh-my-pi/*` internally?**

1. **Merge compatibility**: 2,525 files and 462 source files import `@oh-my-pi/*`. Renaming these would make every upstream merge a semantic conflict nightmare.
2. **Precedent**: `pi-infinity` (lee101) renamed their published package to `@codex-infinity/pi-infinity` but kept internal imports as `@mariozechner/*` — they successfully merge from upstream pi-mono regularly.
3. **The `danger-pi` (shyndman) approach**: Kept `@oh-my-pi/*` entirely, forked oh-my-pi directly, merges work trivially.
4. **oh-my-pi itself**: When Can Bölük renamed from `@mariozechner/*` to `@oh-my-pi/*`, that permanently severed merge compatibility with pi-mono. Lesson learned.

### Re-export Shim

```
@pisces/coding-agent  (published to npm)
  └─ package.json: "dependencies": { "@oh-my-pi/pi-coding-agent": "workspace:*" }
  └─ index.ts: export * from "@oh-my-pi/pi-coding-agent"
  └─ Plus: shoal orchestration, budget API, session inspector, lobster hooks
```

This is a thin wrapper that:
1. Re-exports everything from the internal `@oh-my-pi/pi-coding-agent`
2. Adds Pisces-specific features (shoal, budget, telemetry, lobster)
3. Provides the `pisces` binary
4. Allows us to version independently (`pisces@1.0.0` vs `@oh-my-pi/pi-coding-agent@14.0.1`)

---

## Upstream Sync Procedure

### Setup (one-time)

```bash
git remote add upstream https://github.com/can1357/oh-my-pi.git
git fetch upstream
```

### Regular Sync (recommended: biweekly)

```bash
# 1. Fetch latest upstream
git fetch upstream

# 2. Create a sync branch
git checkout -b sync/upstream-$(date +%Y%m%d)

# 3. Merge with review
git merge upstream/main --no-ff

# 4. Resolve conflicts (see Conflict Surface table above)
#    - bun.lock: delete, run `bun install` to regenerate
#    - CHANGELOG.md: concatenate entries
#    - task/index.ts: careful manual merge (convergent evolution)
#    - Others: typically additive, accept both sides

# 5. Test
bun run check:ts
bun run check:rs
bun test

# 6. Push and PR
git push origin sync/upstream-$(date +%Y%m%d)
```

### Cherry-Pick (for targeted fixes)

When upstream ships a specific fix or feature we want without a full merge:

```bash
git fetch upstream
git cherry-pick <commit-sha>
```

### What NOT to Merge

- Upstream's `task/` additions (we have a superset)
- Upstream's session finalization changes (we have a different model)
- Any changes to `.omp/` paths (we use `.pisces/`)

---

## Ecosystem Research (April 2026)

### Notable Forks

| Fork | Stars | Strategy | Package Names | Upstream Sync |
|------|------:|----------|---------------|---------------|
| `mitsuhiko/pi-mono` | 94 | Soft fork of pi-mono | `@mariozechner/*` (unchanged) | Stopped at v0.50.1 (Jan 2026) |
| `lee101/pi-infinity` | 16 | Hard fork of pi-mono | Published: `@codex-infinity/*`, Internal: `@mariozechner/*` | ✅ Regular merges ("merge upstream + maintain custom features") |
| `agentic-dev-io/pi-agent` | 13 | Soft fork of pi-mono | `@mariozechner/*` (unchanged) | ✅ Merges from pi-mono main |
| `shyndman/danger-pi` | 1 | Soft fork of oh-my-pi | `@oh-my-pi/*` (unchanged) | Active, custom direction |
| `Haleclipse/CometixCode` | 3 | Soft fork of pi-mono | `@mariozechner/*` (unchanged) | Tracked to v0.65.0 |

### Key Pattern: `pi-infinity`

The most relevant precedent. They:
1. Forked `badlogic/pi-mono` directly (not oh-my-pi)
2. Renamed the **published** package to `@codex-infinity/pi-infinity`
3. Kept **internal** imports as `@mariozechner/*`
4. Binary named `pinf`, config dir `.pinf/`
5. Successfully merge upstream with 40 custom commits ahead, only 3 behind
6. Commit message: *"Pi Infinity v0.65.3 - merge upstream + maintain custom features"*

This proves the dual-identity pattern works at scale.

---

## Version Policy

- **Internal packages** (`@oh-my-pi/*`): Track upstream versioning (currently `13.18.0`, migrating to `14.0.x`)
- **Pisces release** (`@pisces/coding-agent`): Independent semver starting at `1.0.0` after re-export shim is in place
- **Git tags**: Continue using upstream tags for sync points; add `pisces/v1.x.x` tags for our releases

---

## Migration Path

### Phase 1: Upstream Remote + Sync (Current)

- [x] Add `upstream` remote
- [x] Test merge to measure conflict surface
- [ ] Complete first real sync to v14.0.x
- [ ] Document conflict resolution procedures per file

### Phase 2: Re-export Shim

- [ ] Create `packages/pisces/` package as thin re-export wrapper
- [ ] Add Pisces-specific features (shoal, budget, telemetry, lobster) as extensions
- [ ] Publish `@pisces/coding-agent` to npm
- [ ] `pisces` binary becomes the primary entry point

### Phase 3: Divergence Point (Future)

When the merge tax consistently exceeds the value of upstream updates:
- [ ] Full `@oh-my-pi/*` → `@pisces/*` rename (2,525 files)
- [ ] Switch from merge to cherry-pick only
- [ ] Cut `pisces@2.0.0` with fully independent namespace
- [ ] This is **not urgent** — the Two-Track model defers this indefinitely

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-08 | Two-Track Model over full rename | Preserves merge compatibility; pi-infinity proves dual-identity works |
| 2026-04-08 | Keep `@oh-my-pi/*` internally | 2,525 files / 462 source files would conflict on every merge if renamed |
| 2026-04-08 | Publish `@pisces/*` as re-export | Independent versioning, branding, without severing upstream |
| 2026-04-08 | Biweekly sync cadence | Upstream ships 3+ releases/week; biweekly keeps us close without churn |
