# Cache Memory Budget

## Problem

Several caches grow monotonically with no byte cap or LRU eviction:

- **SharedCacheRef.files** — `Map<string, string>` holding full file contents, per-tab, no size limit. `onFileEdited` copies updated content into every tab's cache. No eviction.
- **Edit stack** — `MAX_STACK_SIZE=20` per file, `MAX_FILES_TRACKED=200`. Each entry is full previous content. Cap is per-file depth, not total bytes.
- **toolResults invalidation** — O(n) substring scan on every file edit. Quadratic-flavored at scale (500 keys × 50 edits = 25K checks per dispatch).
- **Claim scans** — `forEachClaim` / `getTabsWithActiveAgents` linear scan on every git tool call and every prepareStep.

## Risk

Normal sessions: negligible. 200 files × 10KB × 5 tabs = 50MB.

Long-running sessions with heavy dispatch work and large files: unbounded growth. A 1MB generated file with 20 undo snapshots = 20MB for one file. No cleanup except tab close.

## Fix (when needed)

### Highest impact: byte-budgeted LRU on SharedCacheRef.files

Track total bytes across all entries. When budget exceeded (e.g. 50MB per tab), evict least-recently-accessed entries. Keyed by normalized path, LRU timestamp updated on read and write.

### Secondary: total byte cap on edit stack

Replace per-file `MAX_STACK_SIZE` with a global byte budget (e.g. 100MB across all files). Evict oldest entries from largest stacks first.

### Low priority: indexed toolResults invalidation

Replace `String.includes` scan with a `Map<filePath, Set<cacheKey>>` reverse index. O(1) lookup per file edit instead of O(n) scan.

### Not worth doing: claim scan optimization

Max 5 tabs × ~20 claims = 100 entries. Linear scan is sub-microsecond. Would need thousands of claims to matter.

## When to build

When someone reports memory issues in long sessions, or when profiling shows cache as top memory consumer. Not urgent — current usage patterns stay well within bounds.
