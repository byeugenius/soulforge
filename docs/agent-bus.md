# Agent Bus — Parallel Coordination

The AgentBus coordinates multiple AI agents running in parallel: shared file reads, shared tool results, edit coordination, and real-time peer findings.

## Spark vs Ember

Subagents are classified into two tiers:

- **Spark** (explore/investigate): shares the forge's system prompt and tool definitions for cache prefix hits. Read-only. Uses `taskRouter.spark` model.
- **Ember** (code): own model and context. Full edit capabilities. Uses `taskRouter.ember` model.

The dispatch schema's `tier` field allows override.

## How it works

**File cache.** First agent to read a file caches it. Other agents reading the same file get the cached content (or a compact stub with symbol names and line ranges for large files). Edits invalidate the cache.

**Tool result cache.** Results from read, grep, glob, navigate, analyze, soul_grep, soul_find, soul_analyze, soul_impact, list_dir, and web_search are cached across agents. Cache persists between dispatches within the same session.

**Edit coordination.** Concurrent edits to the same file are serialized. First editor owns the file; second gets a warning. The parent agent is told about conflicts after dispatch completes.

**Findings.** Agents post findings to the bus. Other agents see new findings at the start of each step. Propagation is near-instant (within 1-2 steps).

## Dispatch flow

```
Forge calls dispatch([
  { task: "Find all auth middleware", role: "explore" },       // → Spark
  { task: "Add rate limiting to /api/users", role: "code" }    // → Ember
])
```

1. Create AgentBus (warm cache from previous dispatch if available)
2. Classify tasks → spark or ember, select models from task router
3. Spawn agents with staggered starts
4. Agents run independently with shared bus access
5. Wait for completion (or timeout)
6. Optional post-dispatch: de-sloppify pass, verify pass
7. Aggregate results, compress, export caches, return to Forge

Single-task dispatches skip bus coordination overhead.

## Comparison

| | SoulForge AgentBus | Claude Code Agent Teams |
|---|---|---|
| Execution | In-process, shared memory | Separate processes, mailbox |
| File sharing | Shared cache, deduplicated reads | Worktree isolation (no sharing) |
| Coordination | Real-time findings board | Async mailbox messages |
| Edit safety | Serialized writes with ownership | Worktree isolation |
| Cache persistence | Between dispatches | Per-session |
