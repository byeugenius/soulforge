# Agent Bus — Parallel Coordination

The AgentBus is SoulForge's mechanism for running multiple AI agents in parallel without duplicate work, file conflicts, or lost findings.

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Explore    │  │     Code     │  │  WebSearch   │
│   Agent      │  │    Agent     │  │   Agent      │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └────────────┬────┘─────────────────┘
                    ▼
           ┌────────────────┐
           │    AgentBus    │
           │                │
           │  File Cache    │  ← shared reads, no duplicates
           │  Tool Cache    │  ← LRU 200, cross-agent reuse
           │  Edit Mutex    │  ← serialized writes per file
           │  Findings      │  ← real-time peer communication
           │  Generation    │  ← freshness tracking
           └────────────────┘
```

## File Cache

### Read Deduplication

When agent A reads `src/index.ts`, the content is cached. When agent B reads the same file:

```
Agent A: acquireFileRead("src/index.ts")
  → { cached: false, gen: 0 }  // A is first, starts reading

Agent B: acquireFileRead("src/index.ts")
  → { cached: "waiting", content: Promise<string> }  // B waits for A's Promise

Agent A finishes: releaseFileRead("src/index.ts", content)
  → B's Promise resolves with same content
```

One disk read serves both agents. The `onCacheEvent` callback reports hits and waits for UI display.

### Generation Counter

Each cache entry has a `gen` counter, incremented on every edit. When an agent reads a file, it receives the current generation. If it later tries to write, it can check whether the content has been updated by another agent since.

### Invalidation

`invalidateFile(path)`:
1. Resolve any waiting agents with `null` (so they re-read from disk)
2. Clear the cache entry
3. Expire any tool result cache entries that reference this path

## Tool Result Cache

LRU cache with 200 entry limit. Keyed by `toolName:canonicalized-args`:

```
grep:handleSubmit:src/components:*.tsx
read_code:AgentBus:src/core/agents/agent-bus.ts
glob:**/*.test.ts:src/
```

Cached tools: `read_code`, `grep`, `glob`, `navigate` (some actions), `analyze` (some actions), `web_search`.

### Cross-Dispatch Persistence

```typescript
// In buildSubagentTools() closure:
let sharedCache: SharedCache | undefined;

// First dispatch:
const bus1 = new AgentBus(sharedCache);  // cold start
// ... agents run ...
sharedCache = bus1.exportCaches();       // export warm cache

// Second dispatch:
const bus2 = new AgentBus(sharedCache);  // starts warm
// Agent reads "src/index.ts" → cache hit from previous dispatch
```

`exportCaches()` returns only completed file reads and the full tool result cache. Pending reads and edit state are not exported.

## Edit Mutex

Concurrent edits to the same file are serialized via promise chaining:

```
Agent A: edit "src/index.ts" → lock acquired, edit proceeds
Agent B: edit "src/index.ts" → queued behind A's Promise
Agent A: edit complete → B's edit proceeds
```

The first editor becomes the "owner" via `_fileOwners` map. If a second agent edits the same file, it receives a warning: "Agent 'code-1' also edited this file."

After all dispatches complete, the parent agent is told about conflicts: "Multiple agents edited: src/index.ts"

## Findings

Real-time peer communication without shared context windows.

### Flow

1. Agent calls `report_finding("auth pattern", "Uses JWT with refresh tokens stored in HttpOnly cookies")`
2. Finding appended to bus with `agentId`, `label`, `content`, `timestamp`
3. Deduplication via `findingKeys` set (prevents same finding posted twice)
4. Each agent tracks `_lastSeenFindingIdx` — its index into the findings array
5. On each step, `prepareStep()` calls `drainUnseenFindings(agentId)`:
   - Returns findings posted since this agent's last drain
   - Updates the agent's index
6. New findings injected into system prompt:
   ```
   --- Peer findings (new) ---
   [explore-1] auth pattern: Uses JWT with refresh tokens...
   ```
7. Agent can also call `check_findings()` tool to query all findings on demand

### Latency

Findings propagate within one step (~100ms agent stagger + step processing time). Not instant, but fast enough for practical coordination — one agent's discovery influences the next agent's tool calls within 1-2 steps.

## Dispatch Orchestration

**File**: `src/core/agents/subagent-tools.ts`

### Multi-Agent Dispatch

```
Forge calls dispatch([
  { task: "Find all auth middleware", agent: "explore" },
  { task: "Add rate limiting to /api/users", agent: "code" }
])
```

1. Create AgentBus (import previous SharedCache if available)
2. Register tasks on the bus
3. Spawn agents with 100ms stagger (prevents thundering herd on file reads)
4. Each agent runs independently with shared bus access
5. Wait for all agents to complete (or hit timeout/budget)
6. Aggregate results: each agent's structured output + bus findings
7. Apply `toModelOutput()` compression (collapse blank lines, cap line length)
8. Export caches for next dispatch
9. Return combined result to Forge

### Single-Agent Optimization

If only one task is dispatched, the system skips bus coordination overhead and returns the result directly.

### Result Compression

`toModelOutput()` compresses the dispatch result before the parent Forge sees it:
- Collapse consecutive blank lines
- Truncate individual lines (500 char limit, skip truncation inside code blocks)
- Strip verbose reasoning that doesn't add information

## Comparison

| Feature | SoulForge AgentBus | Claude Code Agent Teams | OpenCode |
|---------|-------------------|------------------------|----------|
| Execution | In-process, shared memory | Separate processes, mailbox | Sequential |
| File sharing | Instant (shared cache) | Worktree isolation (no sharing) | N/A |
| Spawn time | ~100ms stagger | 20-30s per teammate | N/A |
| Coordination | Real-time findings | Async mailbox messages | N/A |
| Token efficiency | Deduplicated reads | Each agent reads independently | N/A |
| Edit safety | Promise-chaining mutex | Worktree isolation | N/A |
| Cache persistence | Between dispatches | Per-session | N/A |

**SoulForge's advantage**: Shared cache eliminates duplicate disk reads across parallel agents. In a typical 3-agent dispatch touching 15 files, the cache serves 40-60% of file read requests from memory instead of disk. Each agent still receives the full content in its context window — the savings are I/O latency, not tokens.

**Claude Code's advantage**: Worktree isolation is inherently safer — no mutex needed, no possibility of edit conflicts. Better for large-scale parallel refactoring where agents touch many overlapping files.
