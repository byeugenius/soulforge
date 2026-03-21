# Repo Map — Competitive Analysis, Cache Strategy & Improvements

## 1. Soul Map vs Aider Repo Map

Both systems share the same foundational insight (tree-sitter parsing + graph ranking to select what matters), but diverge significantly in depth and usage pattern.

### Shared Foundation

- **Tree-sitter AST parsing** for symbol extraction
- **Graph-based ranking** — both use PageRank-style algorithms over a file→file dependency graph
- **Token budget management** — both binary-search for the max content that fits within a budget
- **Core idea**: send a concise map of the codebase to the LLM instead of raw files

### Where We Go Beyond Aider

**1. Personalized PageRank (biggest differentiator)**

Aider runs vanilla PageRank once and picks the top-ranked files that fit the budget. Our system runs **personalized PageRank per-turn** with a restart vector biased by conversation context:

- Edited files: 5× base weight
- Mentioned/read files: 3×
- Active editor file: 2×
- Entry points (package.json main/bin/exports): 4×
- Co-change partners: proportional boost (capped at 2×)

The same repo produces **different maps depending on what you're working on**. Aider's map is more static — it adjusts sizing but not the ranking itself based on conversation.

**2. Co-change analysis (git history signal)**

We parse `git log --name-only` for the last 300 commits and build pairwise co-change counts. Files that always change together (e.g., a migration + its model) get boosted even without direct imports. Aider has nothing like this.

**3. Semantic summaries (LLM-generated)**

Our map enriches top symbols with one-line LLM summaries cached by `(symbol_id, file_mtime)`:

```
+AgentBus — Shared coordination bus for parallel subagent communication
+acquireFileRead — Lock-free file read with cache and waiter pattern
```

Aider shows raw signatures. Our approach gives the LLM a *semantic* understanding of what things do, not just their type shapes.

**4. Multi-signal ranking (post-hoc signals)**

Beyond PageRank, we layer:

- **FTS5 full-text search** on symbol names against conversation terms: +0.5 score
- **Graph neighbor boost** for files adjacent to context files: +1.0 score
- **Co-change partner boost**: +min(count/5, 3.0) score

Aider uses just the graph ranking.

**5. Tool interception layer**

Completely unique to us. The repo map intercepts `grep`, `glob`, `discover_pattern`, and `navigate` tool calls and short-circuits them when the answer is already in the index. Instead of spawning ripgrep or the LSP, we answer from SQLite in microseconds. Saves both time and tokens.

**6. Blast radius tags `[R:N]` and `[NEW]` markers**

Each file in our map shows how many other files depend on it, so the LLM knows the impact of changes. `[NEW]` flags files that appeared since the last render, drawing attention to fresh discoveries.

**7. Richer schema**

Beyond files/symbols/edges, we store:

| Table | Purpose |
|---|---|
| `shape_hashes` | AST shape hashing for duplicate/clone detection |
| `token_signatures` | MinHash for near-duplicate detection |
| `token_fragments` | Repeated code fragment detection |
| `calls` | Call graph (caller→callee at symbol level) |
| `external_imports` | Per-file external package tracking with specifiers |
| `semantic_summaries` | Dual-source (AST + LLM) |
| `cochanges` | Pairwise file co-change counts from git history |

Aider has none of these. Its repo map is a read-only output; ours is a queryable database that powers multiple analysis tools (`soul_analyze`, `soul_impact`, etc.).

### Where Aider Has Advantages

**1. Simplicity and maturity.** Battle-tested across thousands of users. Focused, single-purpose feature. Our system is more complex — more potential for bugs and harder to reason about.

**2. Lower overhead.** No SQLite, no LLM calls for summaries, no git log parsing. Lighter weight. For small repos (<50 files), the extra machinery may be overkill.

**3. Tag-based cross-file references.** Aider originally used `ctags`-style tag extraction. Simpler than our import-resolution approach and may catch some references we miss (dynamic references, string-based lookups).

**4. Dynamic budget sizing.** Aider expands the map significantly when no files are in chat — giving the LLM maximum orientation. Our budget scales inversely with conversation length but doesn't have this "no context yet → expand aggressively" heuristic as explicitly.

### The Real Difference: Passive vs Active

- **Aider**: The repo map is a **passive context attachment** — it goes into the system prompt and the LLM uses it to decide which files to request.
- **Us**: The repo map is an **active query engine** — it intercepts tool calls, answers questions directly from the index, powers analysis tools (duplication, unused exports, blast radius, top files), and feeds into agent dispatch validation. It's not just context — it's infrastructure.

---

## 2. Long Session Token Cost Analysis

### Per-Turn Map Cost

| Session stage | Our budget | Aider budget |
|---|---|---|
| Turn 1 (cold start) | ~2,500 tokens | ~1,024 tokens |
| ~50K conversation tokens | ~2,000 tokens | ~1,024 tokens |
| ~100K+ conversation tokens | ~1,500 tokens | ~1,024 tokens |

Our formula: `budget = 1500 + (4000 - 1500) × max(0.6, 1 - conversationTokens/100000 × 0.4)`

Aider defaults to `--map-tokens 1024`. Over 50 turns:

- **Ours**: ~2000 × 50 = **~100K tokens** for the map
- **Aider**: ~1000 × 50 = **~50K tokens** for the map

**Our map costs roughly 2× more tokens per turn.** But that's the wrong way to count.

### Total Session Cost (Including Avoided Work)

| Item | Ours | Aider |
|---|---|---|
| Map in system prompt (50 turns) | ~100K tokens | ~50K tokens |
| Avoided tool calls via interception | −15K tokens | 0 |
| Avoided exploratory reads via summaries | −10K tokens | 0 |
| Avoided wrong-file reads via personalization | −5K tokens | 0 |
| **Net map-related cost** | **~70K tokens** | **~50K tokens** |

We're still ~40% more expensive on map infrastructure, but the quality of those tokens is higher — the agent wastes fewer turns fumbling.

### Long Session Verdict

**Under ~20 turns:** Roughly equivalent. Aider slightly cheaper.

**20-50+ turns:** Our system pulls ahead on usefulness:

1. **Personalization matters more as sessions get longer.** By turn 30, you've touched 10+ files across 3-4 directories. Aider's global ranking still shows the same top-PageRank files. Ours reshuffles to show files related to *current* focus.

2. **Co-change signal compounds.** Deep refactors benefit from "you always edit X when you edit Y" — invisible to import-graph-only ranking. Prevents "forgot to update the other file" problem.

3. **Interception savings compound.** More turns = more tool calls = more intercepts. 10-20 intercepted tool calls at ~1000 tokens each = substantial savings.

4. **Stale-map problem.** In long Aider sessions, the map can go stale — edited files show old symbol lists until next rescan. Our map re-indexes on edit with debounced 500ms recompute.

---

## 3. File Deletion Cleanup — Current Gap

### Three Cleanup Paths

**✅ Full scan (startup) — clean.** `doScan()` walks the file tree, compares against DB, deletes stale entries:

```typescript
const stale = [...existingFiles.keys()].filter((p) => !currentPaths.has(p));
if (stale.length > 0) {
  const deleteFile = this.db.prepare("DELETE FROM files WHERE path = ?");
  const tx = this.db.transaction(() => {
    for (const p of stale) deleteFile.run(p);
  });
  tx();
}
```

`ON DELETE CASCADE` wipes all related symbols, refs, edges, summaries, shape hashes, etc. Then edges and PageRank are rebuilt.

**✅ File edit (mid-session) — clean.** `onFileChanged()` fires → `indexFile()` does a full wipe-and-reindex of that file's symbols, refs, edges, shape hashes, token signatures, fragments, and calls.

**⚠️ File deletion (mid-session) — NOT cleaned.** The gap:

```typescript
// onFileChanged, line 1696-1701
statAsync(absPath)
  .then((st) => this.ensureTreeSitter().then(() => this.indexFile(...)))
  .then(() => this.markDirty())
  .catch(() => {});  // ← silently swallows the error
```

When a file is deleted, `statAsync(absPath)` throws, `.catch(() => {})` swallows it, and nothing happens. The deleted file stays in the DB until the next full scan (next session startup).

And `recheckModifiedFiles()` explicitly defers:

```typescript
} catch {
  // file deleted — will be caught on next full scan
}
```

### Impact During a Session

- The rendered map in the system prompt shows deleted files (no mtime checks during render)
- PageRank still counts edges to/from the deleted file, distorting rankings
- `seenPaths` still has the deleted file, so it won't get `[NEW]` if recreated
- **Mitigation**: `findSymbols()` and `matchFiles()` do runtime `statSync` checks and skip missing files, so tool interception won't return stale results

### Fix

```typescript
onFileChanged(absPath: string): void {
  const relPath = relative(this.cwd, absPath);
  // ...
  statAsync(absPath)
    .then((st) => /* re-index */)
    .then(() => this.markDirty())
    .catch(() => {
      // File deleted — remove from DB
      this.db.run("DELETE FROM files WHERE path = ?", relPath);
      this.markDirty();
    });
}
```

`ON DELETE CASCADE` handles all child tables automatically. `markDirty()` triggers edge rebuild + PageRank recompute on next render.

---

## 4. Cache-Friendly Map Strategy

### The Problem

The system prompt layout:

```
[1] Static instructions (role, tool guidance, dispatch guidance)  ~800 tokens
[2] Project cwd + projectInfo + forbidden patterns                ~200 tokens
[3] ← Soul Map goes here                                         ~2000 tokens
[4] Editor context, git, memory, mode, skills                    ~300 tokens
```

Every turn the map re-renders with new personalization (different rankings, `[NEW]` tags, updated blast radius). The system prompt text changes every turn → the **entire system prompt is a cache miss** every turn. We pay cache-write (1.25×) for ~3000 tokens every turn instead of cache-read (0.1×).

Anthropic's prompt cache requires **exact prefix matching** — even one character difference before the breakpoint = cache miss.

### Proposed Design: Two-Layer Map

Split into a **stable layer** (cache-friendly) and a **live delta** (small, changes every turn).

**Layer 1: Structural Map (stable, cacheable)**

Frozen snapshot of the repo's structural skeleton. Updated only when files are actually added/removed/re-indexed. Goes in the system prompt, stays byte-identical across turns.

```
Soul Map (structural):
src/core/intelligence/repo-map.ts: (→34)
  +RepoMap — class
  +RepoMapOptions — interface
  +SymbolForSummary — interface
src/core/agents/forge.ts: (→8)
  +createForgeAgent — function
...
```

What makes it stable:
- No `[NEW]` tags (depend on conversation history)
- No personalized ranking — uses global PageRank (computed at scan time)
- No conversation-dependent budget — fixed token budget
- Semantic summaries included (change only when file mtime changes → triggers re-freeze)

**Layer 2: Live Delta (small, injected per-step)**

Tiny focused patch injected via `prepareStep`'s system override. ~200-400 tokens:

```
--- Soul Map context (this turn) ---
Focus: src/core/intelligence/repo-map.ts (edited), src/core/context/manager.ts (mentioned)
Related: src/core/agents/forge.ts (co-change:7), src/core/agents/step-utils.ts (neighbor)
New files: src/core/intelligence/repo-map-cache.ts
Terms: "cache", "prompt", "stable" → matches in: repo-map.ts, manager.ts, provider-options.ts
```

**Savings estimate over 50 turns** (assuming structural changes on ~5 turns):

| Approach | Cost (token-cost-units) |
|---|---|
| Current (50 cache writes) | 50 × 2000 × 1.25 = **125K** |
| Two-layer (5 writes + 45 reads + delta) | 5 × 2000 × 1.25 + 45 × 2000 × 0.1 + 50 × 400 × 1.0 = **41.5K** |
| **Savings** | **67%** |

### Fragility Analysis

**Fragility Point 1: Structural cache goes stale (Medium)**

`onFileChanged()` is async with a debounce timer. If the user sends a message during the debounce window, `buildSystemPrompt()` could serve a stale structural map. Currently mitigated by the 5s TTL on `repoMapCache`, but a structural cache designed to be stable for many turns would make this worse — a stale map could persist for 10+ turns.

Mitigation: The delta layer still shows "edited: foo.ts", so the LLM knows the file matters. But the structural map might show old symbols for that file.

**Fragility Point 2: Delta layer becomes load-bearing (High — biggest risk)**

Currently, personalization is baked into the ranking — the top file in the map IS the most relevant file. The LLM just scans from top to bottom.

With two layers, the LLM must:
1. Read the structural map (global importance)
2. Read the delta (conversation relevance)
3. **Mentally merge them**

This is asking the LLM to do something new. If the delta says "Focus: `src/utils/helpers.ts` (co-change)" but that file is ranked #47 in the structural map (or absent), the LLM must override the structural ranking with the delta signal. Reliable with explicit signals like "edited", shaky with subtle ones like "co-change partner" or "FTS match".

The current implicit approach (just rank the file higher) is more robust because it doesn't require the LLM to understand a meta-protocol.

**Fragility Point 3: "Structural" vs "non-structural" is fuzzy (Medium-High)**

Clear cases:
- File added/deleted → structural ✅
- Symbol added/removed/renamed → structural ✅

Fuzzy cases:
- Semantic summary regenerated (LLM produced a different one-liner) → structural?
- Blast radius changes because a new file imports an existing file → structural?
- Entry points change because `package.json` was edited → structural?
- `git log` picks up a new commit changing co-change scores → structural?

Every fuzzy case is a potential cache-invalidation bug. Too often → no cache benefit. Too rarely → stale map. Lots of tuning time with inevitable edge cases.

**Fragility Point 4: Provider cache mechanics are opaque (Medium)**

We'd be optimizing for Anthropic's current prefix cache behavior:
- **Google Gemini**: Different caching model (explicit `cachedContent` resources, not prefix matching)
- **OpenAI**: No exposed prompt caching
- **OpenRouter**: Routes to various providers, unpredictable cache behavior
- If Anthropic changes min cacheable token thresholds from 1024 to 4096, our ~2000-token structural map falls below → none of this works

Coupling architecture to one provider's implementation detail.

**Fragility Point 5: `prepareStep` system injection is overloaded (Low-Medium)**

`buildForgePrepareStep` already injects via `result.system`: plan mode nudges, dispatch-has-results nudges, excessive-read nudges, task list blocks, steering messages. Adding a delta layer competes with these. And `prepareStep` system is appended — not the stable prefix — so the delta is in a different position every step, further hurting cache on message history.

### Alternative Approaches (Less Fragile)

#### Option A: Freeze-on-Stable (Recommended — Low Fragility)

Keep the current single-layer map. But instead of re-rendering every turn, **hash the structural inputs** (file set + mtimes) and only re-render when the hash changes. Between structural changes, return the exact same string.

```typescript
renderRepoMap(): string {
  const structuralHash = this.computeStructuralHash(); // files + mtimes
  if (this.cachedRender && this.cachedHash === structuralHash) {
    return this.cachedRender; // byte-identical → cache hit
  }
  // Full render with current personalization baked in
  const content = this.repoMap.render({ ... });
  this.cachedRender = content;
  this.cachedHash = structuralHash;
  return content;
}
```

**Trade-off:** Lose per-turn personalization. The map stays personalized to whatever context existed when the last structural change happened. A tiny "Focus: ..." block in `prepareStep` handles the most important conversation-relevance signals.

**Fragility: Low.** One cache, one invalidation trigger (file changes), no mental-merge for the LLM.

#### Option B: Deterministic Personalization (Low-Medium Fragility)

Keep personalization, but make it **deterministic** given the same inputs. Quantize personalization inputs:

```typescript
// Instead of exact file sets, quantize to "focus directories"
const focusDirs = new Set(
  [...editedFiles, ...mentionedFiles].map(f => getDirGroup(f))
);
const focusKey = [...focusDirs].sort().join(',');
```

If focus directories haven't changed, personalization hasn't changed, ranking hasn't changed, output hasn't changed → cache hit.

**Trade-off:** Lose fine-grained personalization within a directory.

#### Option C: Do Nothing, Rely on Message-Level Caching (Zero Fragility)

The system prompt is ~3000 tokens. The message history in a 50-turn session is 200K+ tokens. Even if the system prompt changes every turn, message history still gets cached. The message caching savings **dwarf** the system prompt cost.

- System prompt cache writes over 50 turns: 50 × 3000 × 1.25 = 187.5K token-cost-units
- Message history cache reads: 200K tokens at 0.1× vs 1× = saving 180K token-cost-units per hit

The system prompt changing doesn't prevent message history from being cached — it just means the cache breakpoint moves.

### Recommendation

**Option A (freeze-on-stable)** is the sweet spot. One small change — cache the rendered string and invalidate on structural change. Gets most of the cache benefit with zero architectural risk.

The two-layer split is clever but adds a new failure mode (LLM must mentally merge two views) for marginal gain over freeze-on-stable. The personalization loss from freezing is real but minor — a delta "Focus: ..." injection handles the most important case (telling the LLM which files you're currently working on).

---

## 5. Summary of Actionable Items

| Item | Priority | Effort | Impact |
|---|---|---|---|
| Fix file deletion cleanup in `onFileChanged` | High | Small | Correctness — eliminates stale entries mid-session |
| Implement freeze-on-stable caching (Option A) | Medium | Medium | ~67% cheaper system prompt caching |
| Add "Focus: ..." delta injection in `prepareStep` | Medium | Small | Maintains conversation relevance with frozen map |
| Consider extended TTL (`ttl: "1h"`) for structural map | Low | Tiny | Survives coffee breaks in slow sessions |
| Lower default budget from 2500→1500 for small repos | Low | Tiny | Saves ~50K tokens over 50 turns for repos <200 files |
