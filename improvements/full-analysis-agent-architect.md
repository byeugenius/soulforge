# SoulForge Systems Deep Dive: Full Architecture Analysis

**Perspective**: Dual — Architect (building a flawless system) + Agent/Subagent (operating within it)
**Last updated**: 2026-03-07

---

## System Overview

```
User Input → ContextManager → System Prompt → Agent Loop → Tools → File Events → Back to ContextManager
                  ↓                                ↓
              RepoMap (SQLite)              AgentBus (per-dispatch)
              MemoryManager                Compound Tools (rename/move/project)
              File/Project Caches          Intelligence Router (LSP→ts-morph→tree-sitter→regex)
```

### Event-Driven Invalidation Chain
```
File edit → emitFileEdited() → ContextManager.onFileChanged()
           ↓
           RepoMap.onFileChanged() + markDirty()
           ↓
           invalidateFileTree() + repoMapCache = null
           ↓
           AgentBus.invalidateFile() (if in multi-agent dispatch)
               ↓
               invalidateToolResultsForFile() — purges matching + broad grep/glob entries
```

### Dispatch Execution Flow
```
DISPATCH TOOL
  ↓
emit("dispatch-start")
  ↓
Combine parent abortSignal + bus.abortSignal via AbortSignal.any()
  ↓
FOR EACH AGENT TASK (parallel):
  → emit("agent-start")
    → createAgent(explore|code)
    → wrapWithBusCache(tools)
    → attachBusTools(report_finding, check_findings, cancel_dispatch, etc)
    → registerStepCallbacks()
      ├─ on tool start: emit(SubagentStep, state="running")
      ├─ on tool finish: emit(SubagentStep, state="done"|"error"), emit(AgentStatsEvent)
      └─ on step finish: accumulate tokens, emit(AgentStatsEvent)
    → agent.generate()
    → emit("agent-done" | "agent-error")
  ↓
emit("dispatch-done") + print CacheMetrics
  ↓
export caches to sharedCacheRef
```

---

## Complete Issue Registry

### Cache System

| # | Issue | Severity | Status | Detail |
|---|-------|----------|--------|--------|
| 1 | Tool result cache not invalidated on file edits (broad grep/glob) | High | **FIXED** | `invalidateToolResultsForFile()` now purges grep/glob entries with broad paths (`.`) when any file changes |
| 2 | Search cache ignores backend in key | Medium | **FIXED** | Cache key changed from `query::count` to `query::count::backend`. Checks both brave/ddg keys before API call |
| 3 | Tool cache key fragile — `:` in file paths | Low | **FIXED** | Cache keys now use JSON arrays instead of `:` separators. Parsing handles both formats for backward compat |
| 4 | No cache metrics/observability | Medium | **FIXED** | `CacheMetrics` on AgentBus tracks file hits/misses/waits, tool hits/misses/evictions/invalidations. Printed in dispatch results |
| 5 | `searchCache` and `pageCache` unbounded — no size limit | Low | **FIXED** | Both caches capped at 100 entries with FIFO eviction |
| 6 | RepoMap SQLite unbounded — no compaction trigger | Low | **FIXED** | `compactIfNeeded()` runs after scan — VACUUM + WAL checkpoint when DB exceeds 50MB |
| 7 | Model caches never refreshed | Low | **FIXED** | `modelCache` and `groupedCache` now have 30-minute TTL. Stale entries auto-expire on access |
| 8 | Lazy TTL — stale data persists in memory if never re-read | Low | **FIXED** | `getCached()` in search/page caches now runs periodic sweep (every TTL interval) to purge expired entries |
| 9 | `[Cached]` hint on bus file reads is noisy for config files | Low | **FIXED** | `tagCacheHit()` checks file extension — config/data files get plain `[Cached]` without `read_code()` suggestion |
| 10 | Cache export between dispatches doesn't include findings | Low | **FIXED** | `SharedCache` now includes `findings` array. Imported into new bus via `postFinding()` on construction |

### Agent Bus & Event System

| # | Issue | Severity | Status | Detail |
|---|-------|----------|--------|--------|
| 11 | `setFileEventHandlers` destructive — overwrites all subscribers | High | **FIXED** | Replaced with additive `onFileEdited()`/`onFileRead()` returning unsub functions. ContextManager stores and cleans up its own subscriptions |
| 12 | No agent cancellation mechanism | High | **FIXED** | Added `abort()`/`abortSignal` on AgentBus. New `cancel_dispatch` tool for agents. Dispatch combines parent + bus abort via `AbortSignal.any()` |
| 13 | No backpressure on findings | Medium | **FIXED** | `postFinding()` capped at 30 per dispatch — silently drops after limit |
| 14 | Dependency timeout fixed at 5 minutes | Low | **FIXED** | `AgentTask.timeoutMs` field added. `waitForAgent` uses `task.timeoutMs ?? 300_000` |
| 15 | No per-intent file claiming (only per-edit locking) | Low | **FIXED** | Added `claimFile(agentId, path)` — returns false if another agent already owns the file |
| 16 | No dynamic role promotion (explore → code) | Low | Open | By design — role separation is intentional for safety. Agent can `report_finding` for orchestrator |

### Intelligence & Repo Map

| # | Issue | Severity | Status | Detail |
|---|-------|----------|--------|--------|
| 17 | Token budget shrinks too aggressively with conversation growth | High | **FIXED** | Changed from linear decay (0% at 100k) to gentle decay (60% floor at 100k). `scale = max(0.6, 1 - tokens/100k * 0.4)` |
| 18 | Symbol extraction caps at 300 identifiers per file | Medium | **FIXED** | Raised cap from 300 → 500. Better edge coverage for large files |
| 19 | Edge weighting biased toward long names | Medium | **FIXED** | IDF-based weighting: `idf = log(totalFiles / defCount)`. Replaces flat `def_count > 5` check. CamelCase/snake bonus reduced 10× → 3× |
| 20 | `[NEW]` markers based on render delta, not conversation context | Low | **FIXED** | `seenPaths` Set accumulates all rendered paths across the session. `[NEW]` = truly never-seen file |
| 21 | Semantic summaries rarely generated (too expensive) | Low | Open | Would need cheaper strategy (e.g. docstring extraction instead of LLM calls) |
| 22 | Config/data files indexed but never have symbols | Low | **FIXED** | `rankFiles()` filters out files with `symbol_count === 0` unless they're in conversation context |
| 23 | Tool priority instructions static — don't adapt to backend health | Low | **FIXED** | System prompt appends health warning when repo map has 0 symbols (tree-sitter unavailable), advising grep/read_file fallback |

### Compound Tools

| # | Issue | Severity | Status | Detail |
|---|-------|----------|--------|--------|
| 24 | move_symbol has no rollback mechanism | High | **FIXED** | Added `WriteTransaction` class — stages all writes, commits atomically, rolls back all files on failure |
| 25 | rename_symbol text fallback renames strings/comments | High | **FIXED** | New `replaceInCode()` state machine skips `//`, `/* */`, `#` comments and `"`, `'`, `` ` `` string literals |
| 26 | project tool truncates output at 3000 bytes | High | **FIXED** | Increased to 10,000 bytes with head+tail: first 3000 + last 5000 chars. Errors at bottom always visible |
| 27 | refactor/analyze/navigate are multiplexers, not truly compound | Medium | Open | Each action is a single LSP call. Making them compound would be a larger refactor |
| 28 | No compound "find and fix diagnostic" tool | Medium | Open | Common 5-step workflow could be one tool. Would need new tool definition + prompt integration |
| 29 | test_scaffold fetches type info sequentially | Low | **FIXED** | Changed sequential `for` loop to `Promise.all()` |
| 30 | discover_pattern reads interfaces sequentially | Low | **FIXED** | Parallelized both `readSymbol` and `findExports` calls via `Promise.all()` |
| 31 | rename_symbol output doesn't prominently distinguish LSP vs text backend | Low | **FIXED** | Text fallback now shows explicit warning to verify with `project test` |

### System Prompt & Agent Loop

| # | Issue | Severity | Status | Detail |
|---|-------|----------|--------|--------|
| 32 | Auto-summarization loses tool call details | High | **FIXED** | Added "Tool Results" section to summary prompt. Increased tool-result char limit 1500→3000. Explicit instruction to preserve specific details |
| 33 | Static prompt sections (~2300 chars) not factored into stable cache prefix | Medium | **FIXED** | Extracted to `STATIC_TOOL_PRIORITIES` and `STATIC_DISPATCH_GUIDANCE` module-level constants. Stable references for prompt caching |
| 34 | `coreMessages` grows unbounded within a turn | Medium | Open | No mid-turn compaction. Individual turns rarely exceed context |
| 35 | Task routing is regex-based and fragile | Low | **FIXED** | Coding patterns checked BEFORE exploration. Added action-verb-anywhere pattern. "fix why X broke" now routes to coding |
| 36 | Token estimation (chars ÷ 4) wrong for code | Low | **FIXED** | Changed divisor from 4 → 3 across all 3 estimation sites (summarization trigger, post-compact estimate, streaming estimate) |
| 37 | Subagent system prompts rebuilt from scratch | Low | **FIXED** | Static sections extracted to module constants (shared with subagent constructors). Repo map already TTL-cached |

### Summary

| Category | Total | Fixed | Open |
|----------|-------|-------|------|
| Cache | 10 | **10** | 0 |
| Agent Bus & Events | 6 | **5** | 1 |
| Intelligence & Repo Map | 7 | **6** | 1 |
| Compound Tools | 8 | **6** | 2 |
| System Prompt & Agent Loop | 6 | **5** | 1 |
| **Total** | **37** | **32** | **5** |

---

## 1. Cache System

### All Cache Implementations

#### A. File Content Cache (`FileCache`)
- **Location**: `src/core/intelligence/cache.ts`
- **Type**: LRU-like Map-based cache
- **Key**: Absolute file path
- **Value**: `{ content: string, mtime: number }`
- **Size Limit**: 200 entries (configurable via constructor)
- **Invalidation**: mtime-based (automatically invalidated when file modification time changes on `get()`)
- **Eviction**: FIFO when cache reaches max size — oldest entry deleted

#### B. RepoMap Database Cache (`RepoMap`)
- **Location**: `src/core/intelligence/repo-map.ts`
- **Type**: SQLite database in `.soulforge/repomap.db`
- **Tables**:
  - `files`: path, mtime_ms, language, line_count, symbol_count, pagerank
  - `symbols`: file_id, name, kind, line, end_line, is_exported, signature
  - `edges`: source_file_id, target_file_id, weight (dependency graph)
  - `refs`: file_id, name (identifier references)
  - `cochanges`: file_id_a, file_id_b, count (co-edit patterns)
  - `semantic_summaries`: symbol_id, summary, file_mtime
  - `symbols_fts`: Full-text search virtual table (triggers on insert/delete)
- **Invalidation**: Mtime-based; `onFileChanged()` re-indexes that file; dirty debouncing (500ms) before rebuilding edges/PageRank
- **Lifecycle**: Single instance per workspace, persists across sessions

#### C. Context Manager TTL Caches (`ContextManager`)
- **Location**: `src/core/context/manager.ts`
- **Three TTL-based caches**:
  1. **repoMapCache**: TTL 5,000ms (covers getContextBreakdown + buildSystemPrompt in same prompt)
  2. **fileTreeCache**: TTL 30,000ms (30 seconds)
  3. **projectInfoCache**: TTL 300,000ms (5 minutes)
- **Invalidation**: Manual `invalidate()` calls or TTL expiration on next read

#### D. Web Search & Page Fetch Caches
- **Search Cache** (`searchCache` in `web-search-scraper.ts`): `Map<string, { results, ts, _backend }>`, TTL 5 minutes, key `${query}::${count}::${backend}` **(FIXED: was `query::count`, now includes backend)**
- **Page Cache** (`pageCache` in `fetch-page.ts`): `Map<string, { content, ts, backend }>`, TTL 5 minutes, key = full URL

#### E. Agent Bus Shared Cache (`AgentBus`)
- **Location**: `src/core/agents/agent-bus.ts`
- **Per-dispatch instance** (lifetime = single `dispatch` call):
  1. **File Cache**: `Map<string, FileCacheEntry>` — tracks read state ("reading" | "done" | "failed"), generation counter, waiter promises
  2. **Tool Result Cache**: `Map<string, string>` — max 200 entries, LRU eviction. **(FIXED: now invalidated on file edits via `invalidateToolResultsForFile()`, including broad grep/glob entries)**
  3. **Findings**: Append-only log with deduplication (`agent_id:label`)
  4. **Edit Locks**: Per-file async locks for concurrent editing
  5. **File Ownership**: Tracks which agent last claimed a file
  6. **Cache Metrics** **(NEW)**: `CacheMetrics` tracking file hits/misses/waits, tool hits/misses/evictions/invalidations
- **Export/Import**: `exportCaches()` returns `SharedCache` for inter-dispatch reuse

#### F. Memory Manager Databases (`MemoryManager`)
- **Location**: `src/core/memory/manager.ts`
- **Three SQLite databases**: Global (`~/.soulforge/memory.db`), Project (`.soulforge/memory.db`), Session (`:memory:`)
- **Scope hierarchy**: Session → Project → Global

#### G. LLM Model Caches (`models.ts`)
- **Location**: `src/core/llm/models.ts`
- **Three caches**: `modelCache` (per-provider), `groupedCache` (grouped providers), `openRouterCache` (singleton)
- **Lifecycle**: Session-scoped, never refreshed

#### H. Editor Screen Cache (`screen.ts`)
- **Location**: `src/core/editor/screen.ts`
- **hexCache**: Color code conversion cache
- **cachedLines**: Rendered terminal output rows with dirty tracking

#### I. useChat Hook Reference Caches (`useChat.ts`)
- **coreCharsCache**: Char count for token estimation
- **streamSegmentsBuffer / liveToolCallsBuffer**: In-flight stream data
- **baseTokenUsageRef**: Cumulative token tracking

### Cache Invalidation Matrix

| Cache | Type | Invalidation Trigger |
|-------|------|---------------------|
| FileCache | mtime | Automatic on `get()` |
| RepoMap | mtime + debounce | File event listener + 500ms debounce |
| repoMapCache | TTL + event | 5s TTL or `onFileChanged()` |
| fileTreeCache | TTL + manual | 30s TTL or `invalidateFileTree()` |
| projectInfoCache | TTL + lazy | 5min TTL |
| searchCache | TTL + lazy | 5min TTL, checked on access |
| pageCache | TTL + lazy | 5min TTL, checked on access |
| AgentBus fileCache | Generation counter | Explicit `updateFile()` increments gen |
| AgentBus toolCache | LRU + file-edit invalidation | Delete oldest at 200; **purge on file edits (including broad grep/glob)** |
| Memory DBs | Explicit | `delete()`, `clearScope()`, `close()` |
| Model caches | Persistent | No automatic invalidation (session-lifetime) |
| Screen cache | Dirty tracking | Mark rows dirty; rebuild on render |

### Architect Assessment: What Works

- **Mtime-based FileCache** — auto-invalidates on disk change without explicit signals. Simple, correct.
- **Event-driven invalidation chain** — one `emitFileEdited` cascades through all dependent caches (RepoMap, file tree, repo map cache, AgentBus).
- **Generation counters on AgentBus** — prevents stale overwrites in concurrent reads. Subtle but critical for data integrity.
- **TTL tiers are sensible** — 5s repo map (covers prompt construction), 30s file tree (cheap to rebuild), 5min project info (rarely changes).
- **(FIXED) Tool result invalidation on file edits** — `invalidateToolResultsForFile()` now purges both specific-path and broad grep/glob entries.
- **(FIXED) Search cache keyed by backend** — different backends can't silently overwrite each other.
- **(FIXED) Cache metrics** — dispatch results now include file/tool cache hit rates for observability.
- **(FIXED) Bounded web/page caches** — both `searchCache` and `pageCache` capped at 100 entries with FIFO eviction.
- **(FIXED) Cache hint** — `tagCacheHit()` now checks file extension; config/data files get plain `[Cached]` without misleading `read_code()` suggestion.

### Architect Assessment: Remaining Open Issues

All cache issues fixed.

### Agent Assessment

- **Good**: When I read a file another agent already read, I get it instantly from the bus. The `"waiting"` state with promise queues means I never see a partial read.
- **(FIXED)**: Tool results now get invalidated when files are edited — I won't get stale grep results after a peer edits a file.
- **(FIXED)**: Cache hint on config files no longer suggests `read_code()` — just says `[Cached]`.
- **(FIXED)**: Cache keys are now JSON-based — no more ambiguity from `:` in file paths.
- **(FIXED)**: Web/page caches sweep expired entries proactively, not just lazily.
- **(FIXED)**: Model caches refresh every 30 minutes — no more stale model lists.

---

## 2. Agent Bus & Event System

### Architecture

**Core Event Files:**
- `src/core/agents/subagent-events.ts` — Multi-agent coordination events (SubagentStep, MultiAgentEvent, AgentStatsEvent)
- `src/core/tools/file-events.ts` — File edit/read events **(FIXED: now additive subscriptions)**
- `src/core/agents/agent-bus.ts` — Shared cache & coordination layer **(FIXED: abort support + metrics)**

**Event Types:**
- `SubagentStep`: Individual tool calls within agents (`running`, `done`, `error`)
- `MultiAgentEvent`: Dispatch-level coordination (`dispatch-start`, `agent-start`, `agent-done`, `agent-error`, `dispatch-done`)
- `AgentStatsEvent`: Real-time token/tool usage tracking per agent
- File events: `emitFileEdited(path, content)` and `emitFileRead(path)`

### File Events — Additive Subscriptions (FIXED)

**Before**: `setFileEventHandlers()` would clear ALL listeners and register new ones. Only one subscriber allowed.

**After**: `onFileEdited(cb)` and `onFileRead(cb)` add listeners to a Set and return an `unsub()` function. Multiple components can subscribe independently. ContextManager stores its unsub handles and calls them in `dispose()`.

### Agent Bus Coordination Layer

The `AgentBus` enables parallel agents to share state without race conditions:

**File Caching**: `acquireFileRead()` returns cached content, waiting Promise, or "start reading" signal. Generation counters prevent stale overwrites.

**Edit Locking**: `acquireEditLock(agentId, path)` serializes edits to same file via Promise chains. `getFileOwner()` tracks first editor.

**Tool Result Caching**: LRU cache (max 200) for `read_code`, `grep`, `glob`, `navigate`, `analyze`, `web_search`. **(FIXED: invalidated on file edits, including broad-path grep/glob entries)**

**Cache Metrics (NEW)**: `CacheMetrics` interface tracking `fileHits`, `fileMisses`, `fileWaits`, `toolHits`, `toolMisses`, `toolEvictions`, `toolInvalidations`. Exposed via `.metrics` getter.

**Agent Cancellation (NEW)**: `abort(reason)` triggers an `AbortController` on the bus. `abortSignal` propagates to all agents via `AbortSignal.any([parentAbort, bus.abortSignal])`.

**Bus Tools** (available to subagents):
- `report_finding()` — share discoveries with peers (immutable append-only)
- `check_findings()` — query all/specific peer findings
- `check_peers()` — see peer agents' IDs, roles, tasks, status
- `check_agent_result()` — get a completed peer's final result (waits if not done)
- `check_edit_conflicts()` — see file ownership and edit history
- `cancel_dispatch()` **(NEW)** — abort the entire dispatch when the approach is fundamentally wrong

### Cache Wrapping (`wrapWithBusCache`)

`src/core/tools/index.ts` transparently hooks tools for agents in a dispatch:
- **read_file**: Full reads go through bus acquire/release cycle. Cache hits tagged with `[Cached]` hint.
- **edit_file**: Acquires edit lock, updates bus cache on success, invalidates on failure. Detects when another agent owns the file.
- **Tool results**: Keys like `read_code:file:target:name`, `grep:pattern:path:glob`. Automatic LRU management.

### Architect Assessment: What Works

- **Immutable-append-only findings** — no deletions, no race conditions.
- **Edit locks with ownership tracking** — serializes concurrent edits. First editor owns the file.
- **Clean unsubscribe pattern** — every `onX()` returns `unsub()`, called in `finally`. No leaks detected.
- **(FIXED) Additive file events** — `onFileEdited()`/`onFileRead()` are additive; multiple components subscribe independently without wiping each other.
- **(FIXED) Agent cancellation** — `cancel_dispatch` tool lets agents abort the entire dispatch. Combined abort signals propagate to all agents.
- **Staggered starts** — independent tasks staggered by 100ms to reduce API burst. Dependent tasks start immediately.

### Architect Assessment: Remaining Open Issues

**1. No dynamic role promotion (explore → code)** — by design. Role separation is intentional for safety.

### Agent Assessment

- **Good**: `report_finding` / `check_findings` / `check_peers` gives me awareness of what other agents are doing.
- **(FIXED)**: I can now call `cancel_dispatch` to abort all peers when I discover the approach is wrong.
- **(FIXED)**: Findings capped at 30 — peer prompts won't get inflated if agents are verbose.
- **(FIXED)**: Dependency timeouts now configurable per-task via `timeoutMs`.
- **(FIXED)**: I can `claimFile()` before editing to prevent conflicts proactively.
- **(FIXED)**: Findings from previous dispatches now carry over via SharedCache.

---

## 3. Intelligence & Repo Map

### Repo Map Implementation

**Core File**: `src/core/intelligence/repo-map.ts` (1383 lines)

**Storage**: SQLite with WAL mode in `.soulforge/repomap.db`. Foreign-keyed tables for files, symbols, edges, refs, cochanges, semantic_summaries, and FTS5 virtual table.

**Incremental updates**: On `onFileChanged()`, only changed files re-indexed (mtime comparison). 500ms dirty debounce before edge/PageRank recompute.

### Symbol Extraction

**Primary**: Tree-sitter (20+ languages via WASM grammars) — returns FileOutline with symbols, imports, exports, line numbers, signatures.

**Fallback**: Regex identifier extraction — `[A-Z][a-zA-Z0-9_]*` + `[a-z][a-zA-Z0-9_]{2,}`, filtered through 300+ keywords, capped at 300 identifiers per file.

### PageRank Algorithm

Personalized PageRank with 20 iterations, damping factor 0.85.

**Edge construction**:
```
edges = JOIN(refs, symbols)
  WHERE ref.name = symbol.name
  AND ref.file_id != symbol.file_id
  AND symbol.is_exported = 1

weight = sqrt(ref_count) × multiplier:
  × 10 if camelCase/snake_case (8+ chars) — specific names score high
  × 0.1 if starts with "_" — private/internal
  × 0.1 if defined in 5+ files — generic names
```

**Personalization vector**: 70% uniform + 30% context boost:
- Mentioned files: +3× base
- Edited files: +5× base
- Editor file: +2× base
- Co-change partners: lighter boost

### Token Budget (FIXED)

**Before**: `scale = max(0, 1 - tokens/100k)` — budget dropped to MIN_TOKEN_BUDGET (1500) at 100k tokens. Agent lost visibility during complex tasks.

**After**: `scale = max(0.6, 1 - tokens/100k * 0.4)` — budget retains 60% floor even at 100k tokens. At 50k tokens, budget is ~3400 (was ~2750). Deep conversations keep visibility.

| Conversation Tokens | Old Budget | New Budget |
|---------------------|-----------|------------|
| 0 | 2500 | 2500 |
| 25k | 2875 | 3250 |
| 50k | 2250 | 3000 |
| 75k | 1625 | 2750 |
| 100k | 1500 | 2500 |

### Git Co-Changes

Parses `git log --format="---COMMIT---" --name-only -n 300`. Pairs all modified files per commit, counts frequency (min 2 to record), filters to 20 files max per commit.

### Context Manager

**Core File**: `src/core/context/manager.ts` (931 lines)

Wraps RepoMap, MemoryManager, editor state, git context, skills. Tracks per-conversation: editedFiles, mentionedFiles, conversationTerms (stop-word filtered), conversationTokens.

**(FIXED)**: Now uses additive `onFileEdited()`/`onFileRead()` subscriptions with stored unsub handles, instead of the destructive `setFileEventHandlers()`.

### Architect Assessment: What Works

- **PageRank with personalization** — elegantly solves "which files matter right now."
- **Co-change mining** — captures coupling static analysis misses.
- **Binary-search token budgeting** — efficient use of context window with 5% overage tolerance.
- **Incremental indexing** — mtime skip + 500ms debounce.
- **FTS5 on symbols** — fast text search across the entire symbol table.
- **Tiered backend fallback** — always has an answer, quality degrades gracefully.
- **(FIXED) Token budget** — gentle decay keeps 60%+ of budget even deep in conversations.
- **(FIXED) Symbol extraction cap** — raised from 300 → 500 identifiers per file for better edge coverage.

### Architect Assessment: Remaining Open Issues

- **(FIXED) Edge weighting** — IDF-based: `idf = log(totalFiles / defCount)`. Symbols defined in many files get low weight; rare symbols get high weight. Short common names no longer penalized.
- **(FIXED) `[NEW]` markers** — session-cumulative `seenPaths` Set. Files are marked `[NEW]` only the first time they appear in the conversation, not on every re-rank.
- **Semantic summaries rarely generated** — too expensive for interactive use. Needs a cheaper LLM strategy (e.g., batch summarization with a small model). Not a quick fix.
- **(FIXED) Config/data files** — files with `symbol_count === 0` are now filtered from PageRank ranking unless they're in the active context set (boost files, neighbor files).
- **(FIXED) Health warning** — system prompt now includes a warning when repo map has 0 symbols indexed, so agents know code intelligence is limited.
- **(FIXED) SQLite compaction** — `compactIfNeeded()` runs WAL checkpoint + VACUUM when DB exceeds 50MB.

### Agent Assessment

- **Good**: The repo map gives me immediate orientation without tool calls.
- **(FIXED)**: Token budget no longer shrinks aggressively — I keep visibility even 100k tokens into a conversation.
- **(FIXED)**: Symbol extraction cap raised to 500 — large files get better PageRank edges.
- **(FIXED)**: IDF edge weighting means rare, meaningful symbols drive PageRank more than common ones.
- **(FIXED)**: `[NEW]` markers are now session-cumulative — I see genuinely new files, not ranking noise.
- **(FIXED)**: Config files no longer pollute rankings — only files with actual symbols compete for context budget.
- **Remaining**: The render is a snapshot. If I edit a file and immediately ask for context, the 5s TTL can serve stale data.

---

## 4. Compound Tools

### rename_symbol
**File**: `src/core/tools/rename-symbol.ts`

**Composite pipeline**: Locate symbol → LSP rename (with 2s retry for cold LSP) → grep verify → text-based fallback for remaining references → unified output.

**Text fallback (FIXED)**: Now uses `replaceInCode()` — a state machine that scans the source character by character, tracking whether it's inside a string literal (`"`, `'`, `` ` ``), single-line comment (`//`), multi-line comment (`/* */`), or hash comment (`#`). Only replaces the symbol in code regions, preserving strings, comments, and test fixtures.

**Output steering**: "Verified: zero remaining references, zero type errors. Next step: `project test`. Nothing else needed."

### move_symbol
**File**: `src/core/tools/move-symbol.ts`

**Composite pipeline**: Symbol extraction (LSP with fallback range detection) → comment/doc attachment → intelligent import resolution → target creation/append → source cleanup → codebase-wide importer updates.

**Transactional writes (FIXED)**: Added `WriteTransaction` class:
- `stage(path, content)` — records file path, new content, and original content (or `null` for new files)
- `commit()` — writes all staged files atomically
- `rollback()` — on commit failure, restores all files to their original content (or deletes newly created files)

All writes (target, source, importers) are staged first, then committed in one pass. If any write fails, all previous writes are rolled back.

**Per-language import handlers**:
- TS/JS: `import type { }` for verbatimModuleSyntax, relative path normalization
- Python: `from X import Y`, relative dot imports
- Rust: `use crate::path::{ }`, module structure
- Go/C++: Graceful degradation (manual updates tracked in affectedFiles)

### project
**File**: `src/core/tools/project.ts`

**Composite pipeline**: Toolchain auto-detection (20+ ecosystems from lockfiles/configs) → toolchain-specific command mapping → conditional flag injection → cross-platform spawning → output handling.

**Output handling (FIXED)**: Changed from 3000-byte head truncation to 10,000-byte head+tail strategy:
- Under 10k: show full output
- Over 10k: first 3000 chars + last 5000 chars (errors at the bottom are always visible)

**Flag injection**: `biome → --write`, `eslint → --fix`, `ruff → check --fix`, `clippy → --fix`, `rubocop → -a`

### Other multi-action tools
- **refactor** (359 lines): Multi-action enum (rename, extract_function, extract_variable, format, organize_imports) + post-edit diagnostics
- **analyze** (345 lines): Multi-action enum (diagnostics, type_info, outline, code_actions, unused, symbol_diff)
- **navigate** (418 lines): Multi-action enum (10 variants) with consistent formatting + backend tracking

### Tool Registration System

`buildTools()` in `src/core/tools/index.ts` (1073 lines) returns 30+ tools using Vercel AI SDK's `tool()` wrapper with Zod schemas. Multiple tool subsets for different contexts:

| Tool Set | Purpose | Edit Capable |
|----------|---------|-------------|
| `buildTools()` | Full tools for main agent | Yes |
| `buildRestrictedModeTools()` | architect/socratic/challenge modes | No |
| `buildPlanModeTools()` | Plan mode | No |
| `buildReadOnlyTools()` | Explore agents | No |
| `buildSubagentExploreTools()` | Explore subagents (300 line cap) | No |
| `buildSubagentCodeTools()` | Code subagents | Yes |

### Architect Assessment: What Works

- **rename_symbol: locate → LSP → grep verify → text fallback** — the verify-and-fix pipeline catches LSP misses reliably.
- **(FIXED) rename_symbol text fallback** — `replaceInCode()` skips strings and comments, preventing false positive renames.
- **(FIXED) move_symbol transactional writes** — `WriteTransaction` commits atomically, rolls back on failure.
- **(FIXED) project output** — head+tail truncation ensures error messages at the bottom are always visible.
- **move_symbol per-language handlers** — correct abstraction for import systems.
- **Tool descriptions as behavioral steering** — "DO NOT grep, glob, or read files first" prevents wasted steps.

### Architect Assessment: Remaining Open Issues

**1. refactor/analyze/navigate are multiplexers, not truly compound** — each action is a single LSP call.

**2. No compound "find and fix diagnostic" tool** — common 5-step workflow could be one tool.

### Agent Assessment

- **Good**: `rename_symbol` is my favorite tool — just works, description tells me not to do prep work.
- **(FIXED)**: Text fallback no longer renames string literals and comments. And now warns explicitly when text fallback is used.
- **(FIXED)**: `move_symbol` is now safe — if it partially fails, everything rolls back.
- **(FIXED)**: `project test` output now shows errors at the bottom — I can see what failed.
- **(FIXED)**: `test_scaffold` and `discover_pattern` now fetch type info / symbol blocks in parallel.

---

## 5. System Prompt & Agent Loop

### System Prompt Construction

**Location**: `src/core/context/manager.ts`, method `buildSystemPrompt()`

Built fresh every turn. Sections in order:

1. **Identity & Style** (~200 chars) — "You are Forge, the AI inside SoulForge"
2. **Project Info** (dynamic, ~500-1000 chars) — auto-detected project type, toolchain, first 500 chars of manifest
3. **Codebase Context** (variable) — repo map (if ready) OR simple file tree (3 levels, max 50 lines)
4. **Tool Priorities** (static ~1500 chars) — explicit rules for navigate, read_code, analyze, rename_symbol
5. **Dispatch Guidance** (static ~800 chars) — when to use parallel agents, task format requirements
6. **Editor State** (dynamic, ~200-500 chars) — open file, vim mode, cursor, visual selection
7. **Git Context** (dynamic) — branch, staged/unstaged changes, remote status
8. **Forbidden Patterns** (dynamic) — paths that cannot be read/edited
9. **Project Memory** (dynamic) — persistent notes from `.soulforge/memory/`
10. **Forge Mode Instructions** (dynamic) — architect, socratic, challenge, plan modes
11. **Skills** (dynamic) — loaded skill files

**Cache control**: Anthropic `cacheControl: { type: "ephemeral" }` on system prompt — 5min prompt cache.

### Main Agent Loop

**Location**: `src/hooks/useChat.ts`, `handleSubmit()`

```
User input
  → detectTaskType() → resolveTaskModel()
  → updateConversationContext()
  → createForgeAgent() [tools + system prompt + provider options]
  → agent.stream({ messages, abortSignal })
  → for await (part of result.fullStream)
      ├─ reasoning-start/delta/end → append to reasoning segment
      ├─ text-delta → append to text output
      ├─ tool-input-start/delta → create live tool call UI
      ├─ tool-result → record completed tool call
      ├─ tool-error → record tool error
      ├─ finish-step → update token usage
      └─ error → append to text
  → saveSession()
  → setCoreMessages([...prev, ...responseMessages])
```

### Auto-Summarization (FIXED)

- **Trigger**: `(systemChars + coreChars) / contextBudgetChars > 0.7` AND `coreMessages.length >= 6`
- **Process**: Keep last 4 messages, summarize older into "CONTEXT COMPACTION" user message

**Before**: Summary prompt was generic — tool results were compressed to 1500 chars and the prompt said "be thorough" without specifics.

**After**: Summary prompt now includes:
- **"Tool Results" section** — explicitly asks for key tool results (grep matches, test output, diagnostics, build errors) with literal output
- **Increased tool-result char limit** — 1500 → 3000 chars per tool result
- **Increased general content limit** — 1000 → 4000 chars per message (1500 for non-text part fallback)
- **Explicit instruction**: "Preserve specific details from tool results (file contents, error messages, test output). Generic summaries like 'edited file X' are useless — include WHAT was changed."

### Provider Options & Degradation

Three degradation levels for transient errors:
- Level 0: Full options (thinking, effort, speed, context management)
- Level 1: Thinking enabled only (no budget)
- Level 2: No provider options

### Architect Assessment: What Works

- **Fresh system prompt every turn** — repo map, editor state, git context always current.
- **Auto-summarization at 70%** — prevents context overflow while preserving recent messages.
- **(FIXED) Auto-summarization preserves tool details** — summary prompt now specifically requests tool output, error messages, and edit details.
- **(FIXED) Token estimation** — changed chars÷4 to chars÷3 for more accurate code token estimation. Auto-summarization now triggers earlier, preventing context overflow.
- **Provider degradation levels** — graceful fallback if model doesn't support features.
- **Segment-based streaming** — reasoning, text, tools, plan tracked as distinct segments.
- **Ephemeral cache control** — system prompt gets prompt-cached for 5min.

### Architect Assessment: Remaining Open Issues

- **(FIXED) Static prompt sections** — `STATIC_TOOL_PRIORITIES` and `STATIC_DISPATCH_GUIDANCE` extracted to module-level constants. Stable across turns, exported for reuse.
- **`coreMessages` grows unbounded within a turn** — no mid-turn compaction. Architectural change needed (streaming compaction is complex).
- **(FIXED) Task routing priority** — coding patterns now checked BEFORE exploration patterns. Added `make` to coding verbs, added action-verb-anywhere pattern (e.g., "fix the bug" matches coding even without leading verb).
- **(FIXED) Subagent timeout** — `AgentTask.timeoutMs` field allows per-task timeout configuration, used in `waitForAgent()`.

### Agent Assessment

- **Good**: The repo map section gives me immediate orientation without tool calls.
- **Good**: Tool priority instructions prevent dumb choices.
- **(FIXED)**: Auto-summarization now preserves what I found in tool results — I won't re-read files or re-run commands unnecessarily.
- **(FIXED)**: Token estimation is now ÷3 instead of ÷4 — auto-summarization triggers at the right time instead of too late.
- **(FIXED)**: Static prompt sections are factored out — no wasted tokens regenerating identical content each turn.
- **(FIXED)**: Task routing correctly identifies "fix the bug" as coding, not exploration.
- **Remaining**: As a subagent, implicit knowledge sharing with the main agent is weak. Mid-turn compaction would help for very long agent runs.

---

## What Was Fixed — Implementation Details

### 1. Tool result cache invalidation (`agent-bus.ts`)
New `invalidateToolResultsForFile(filePath)` method called by both `updateFile()` and `invalidateFile()`:
- Deletes tool cache entries containing the specific file path
- Additionally deletes all `grep:` and `glob:` entries with broad search paths (containing `:.`) since those may include results from the changed file

### 2. move_symbol rollback (`move-symbol.ts`)
New `WriteTransaction` class:
- `stage(path, content)` — records original content (or null for new files)
- `commit()` — writes all staged files
- `rollback()` — reverses all committed writes, deletes newly created files
- All file writes (target, source, importers) now go through the transaction

### 3. Token budget scaling (`repo-map.ts`)
Changed `computeBudget()` formula:
- Old: `max(0, 1 - tokens/100k)` — linear decay to zero
- New: `max(0.6, 1 - tokens/100k * 0.4)` — gentle decay with 60% floor

### 4. Auto-summarization (`useChat.ts`)
Enhanced `summarizeConversation()`:
- Added "Tool Results" section to summary prompt
- Increased tool-result char limit: 1500 → 3000
- Increased general content limit: 1000 → 4000 (1500 for non-text part fallback)
- Added critical instruction to preserve specific details

### 5. Cache metrics (`agent-bus.ts`)
New `CacheMetrics` interface and `_metrics` field:
- Incremented in `acquireFileRead()`, `acquireToolResult()`, `cacheToolResult()`, `invalidateToolResultsForFile()`
- Exposed via `get metrics()` getter
- Printed in dispatch result output (`subagent-tools.ts`)

### 6. Project output truncation (`project.ts`)
Changed from `output.slice(0, 3000)` to head+tail strategy:
- MAX_OUTPUT: 10,000 bytes
- HEAD: 3,000 bytes, TAIL: 5,000 bytes
- Under limit: full output. Over limit: head + "[N chars truncated]" + tail

### 7. Agent cancellation (`agent-bus.ts`, `bus-tools.ts`, `subagent-tools.ts`)
- `AgentBus._abortController` with `abort(reason)` method and `abortSignal` getter
- New `cancel_dispatch` bus tool — posts finding with reason, then triggers abort
- Dispatch execution combines parent abort signal with bus abort signal via `AbortSignal.any()`

### 8. Additive file events (`file-events.ts`, `manager.ts`, `useChat.ts`)
- Removed `setFileEventHandlers()` (destructive, single-subscriber)
- Removed `onFileEditedEvent()` (separate parallel mechanism)
- Added `onFileEdited(cb)` and `onFileRead(cb)` — additive, return unsub functions
- ContextManager stores unsub handles and calls them in `dispose()`
- useChat updated to use new `onFileEdited` name

### 9. rename_symbol text fallback (`rename-symbol.ts`)
New `replaceInCode(source, escapedSymbol, newName)` function:
- State machine scanning character by character
- Skips: `//` single-line comments, `/* */` multi-line comments, `#` hash comments
- Skips: `"`, `'`, `` ` `` string literals (with backslash escape handling)
- Only replaces `\b{symbol}\b` in code regions

### 10. Search cache backend key (`web-search-scraper.ts`)
- Cache key changed from `${query}::${count}` to `${query}::${count}::${backend}`
- Before checking cache, tries both `brave` and `ddg` keys
- After API call, stores result with the actual backend used

### 11. Token estimation accuracy (`useChat.ts`)
- Changed `chars / 4` → `chars / 3` in three sites:
  - Post-compaction token estimate (line ~500)
  - Context budget calculation for auto-summarization trigger (line ~531)
  - Streaming token estimate (line ~979)
- Code has higher token density than prose — ÷3 is closer to reality
- Auto-summarization now triggers earlier, preventing context overflow for code-heavy sessions

### 12. Findings backpressure (`agent-bus.ts`)
- `postFinding()` now checks `this.findings.length >= 30` before accepting
- Prevents runaway agents from inflating peer context with unlimited findings
- 30 is generous (typical: 1-5 per agent) but prevents pathological cases

### 13. Bounded web caches (`web-search-scraper.ts`, `fetch-page.ts`)
- Both `searchCache` and `pageCache` now capped at 100 entries
- FIFO eviction: oldest entry deleted when limit reached
- Prevents unbounded memory growth in long sessions with heavy web usage

### 14. Symbol extraction cap (`repo-map.ts`)
- `MAX_REFS_PER_FILE` raised from 300 → 500
- Large files now contribute more edges to the PageRank graph
- Better cross-file dependency tracking for files with many identifiers

### 15. test_scaffold parallelization (`test-scaffold.ts`)
- Changed sequential `for` loop over exports to `Promise.all()`
- Type info for all exports fetched concurrently instead of one-by-one

### 16. discover_pattern parallelization (`discover-pattern.ts`)
- `readSymbol` calls for interfaces: sequential → `Promise.all()`
- `findExports` calls for related files: sequential → `Promise.all()`
- Both sections now fetch data concurrently

### 17. rename_symbol text fallback warning (`rename-symbol.ts`)
- When LSP rename unavailable, output now shows explicit warning:
  "⚠ LSP rename unavailable — used text-based replacement (strings/comments preserved). Verify edge cases with `project test`."
- LSP-backed renames keep the confident "zero remaining references" message

### 18. Cache hint for config files (`index.ts`)
- `tagCacheHit()` now checks file extension against `CONFIG_EXTENSIONS` set
- Config/data files (`.json`, `.yaml`, `.toml`, `.md`, `.css`, `.html`, etc.) get plain `[Cached]`
- Source code files get the full `[Cached — use read_code(...)]` hint

### 19. Tool cache keys — JSON-based (`index.ts`, `agent-bus.ts`)
- All tool result cache keys switched from `:` separators to `JSON.stringify([tool, ...args])`
- `invalidateToolResultsForFile()` handles both JSON and legacy key formats
- `acquireToolResult()` parses tool name from JSON array
- `getToolResultSummary()` extracts tool name and args from JSON keys
- Eliminates ambiguity from file paths containing `:`

### 20. RepoMap SQLite compaction (`repo-map.ts`)
- New `compactIfNeeded()` called after scan completes
- Checks `dbSizeBytes()` — runs WAL checkpoint + VACUUM if DB exceeds 50MB
- Best-effort: silently catches errors

### 21. Model caches TTL (`models.ts`)
- `modelCache` changed from `Map<string, ProviderModelInfo[]>` to `Map<string, { models, ts }>`
- `groupedCache` changed from `Map<string, GroupedModelsResult>` to `Map<string, { result, ts }>`
- Both use `MODEL_CACHE_TTL = 30 * 60_000` (30 minutes)
- All access sites check TTL before returning cached data

### 22. Lazy TTL sweep (`web-search-scraper.ts`, `fetch-page.ts`)
- `getCached()` now tracks `lastSweep` timestamp
- Every TTL interval, sweeps all entries and deletes expired ones
- Prevents stale entries from accumulating in memory between accesses

### 23. SharedCache includes findings (`agent-bus.ts`)
- `SharedCache` interface now includes `findings: BusFinding[]`
- `exportCaches()` exports findings array
- Constructor imports findings via `postFinding()` (respects dedup + cap)

### 24. Configurable dependency timeout (`agent-bus.ts`, `subagent-tools.ts`)
- `AgentTask` interface gains optional `timeoutMs` field
- `runAgentTask()` passes `task.timeoutMs ?? 300_000` to `bus.waitForAgent()`

### 25. File claiming (`agent-bus.ts`)
- New `claimFile(agentId, path)` method
- Returns `true` if file unclaimed or already owned by this agent
- Returns `false` if another agent owns the file
- Normalizes path before checking ownership

### 26. IDF-based edge weighting (`repo-map.ts`)
- `buildEdges()` now computes `totalFiles` count
- Weight formula: `idf = log(totalFiles / max(1, defCount))`, normalized to `max(0.5, idf / log(totalFiles))`
- CamelCase/snake bonus reduced from 10× to 3×
- Removes flat `def_count > 5` penalty — IDF handles this naturally

### 27. [NEW] markers track seen files (`repo-map.ts`)
- Replaced `prevRenderedPaths` (render-delta) with `seenPaths` (session-cumulative Set)
- `[NEW]` now means "file has never appeared in any render this session"
- `seenPaths.add()` called for every rendered file path
- `clear()` resets on full DB reset

### 28. Config files excluded from PageRank ranking (`repo-map.ts`)
- `rankFiles()` filters out files with `symbol_count === 0` unless they're in conversation context (mentioned/edited/neighbors)
- Config/data files only appear in repo map when contextually relevant

### 29. Tool priority health check (`manager.ts`)
- `buildSystemPrompt()` checks `repoMap.getStats().symbols === 0` when repo map is ready
- Appends health warning advising grep/read_file fallback when code intelligence is limited

### 30. Static prompt extraction (`manager.ts`)
- `STATIC_TOOL_PRIORITIES` and `STATIC_DISPATCH_GUIDANCE` extracted to module-level constants
- Exported for potential reuse by subagent prompt builders
- Stable reference identity enables prefix caching across turns

### 31. Task routing priority fix (`task-router.ts`)
- Coding patterns now checked BEFORE exploration patterns
- Added `make` to coding pattern list
- Added action-verb-anywhere pattern: `fix|implement|add|... + the|this|a|an|that|it`
- "fix why the build is broken" → `coding` (was `exploration`)

---

## Key File Reference

### Cache
- `src/core/intelligence/cache.ts` — FileCache
- `src/core/intelligence/repo-map.ts` — RepoMap SQLite + token budget
- `src/core/context/manager.ts` — TTL caches + file event subscriptions
- `src/core/tools/web-search-scraper.ts` — Search cache (backend-keyed)
- `src/core/tools/fetch-page.ts` — Page cache
- `src/core/agents/agent-bus.ts` — Bus caches + metrics + abort
- `src/core/memory/manager.ts` — Memory DBs
- `src/core/llm/models.ts` — Model caches

### Agent Bus & Events
- `src/core/agents/subagent-events.ts` — Event hub
- `src/core/tools/file-events.ts` — File events (additive subscriptions)
- `src/core/agents/agent-bus.ts` — Coordination layer + cancellation + metrics
- `src/core/agents/bus-tools.ts` — Bus tools for subagents (+ cancel_dispatch)
- `src/core/agents/subagent-tools.ts` — Dispatch tool + combined abort signals

### Intelligence & Repo Map
- `src/core/intelligence/repo-map.ts` — Core repo map (gentle budget decay)
- `src/core/context/manager.ts` — Context management
- `src/core/intelligence/router.ts` — Backend selection
- `src/core/intelligence/backends/tree-sitter.ts` — Symbol extraction
- `src/core/intelligence/types.ts` — Backend interface

### Compound Tools
- `src/core/tools/rename-symbol.ts` — replaceInCode() for safe text fallback
- `src/core/tools/move-symbol.ts` — WriteTransaction for atomic rollback
- `src/core/tools/project.ts` — Head+tail output truncation
- `src/core/tools/refactor.ts` — Multi-action refactoring
- `src/core/tools/analyze.ts` — Multi-action analysis
- `src/core/tools/navigate.ts` — Multi-action navigation

### System Prompt & Agent Loop
- `src/core/context/manager.ts` — System prompt building
- `src/core/tools/index.ts` — Tool registration
- `src/hooks/useChat.ts` — Main agent loop + enhanced summarization
- `src/core/agents/forge.ts` — Agent creation
- `src/core/llm/provider-options.ts` — Provider options
- `src/core/llm/task-router.ts` — Task routing
