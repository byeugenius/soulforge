# Refactoring Plan — Duplication Reduction

Identified via `soul_analyze duplication` — AST structural clones, near-duplicates, and repeated patterns.

---

## 1. 🔴 `sysMsg()` helper underused in commands.ts (HIGH — ~250 lines saved)

**Problem:** A `sysMsg(ctx, content)` helper already exists at line 88, but the same 6-line pattern is copy-pasted **~49 times** throughout `handleCommandInner`:

```ts
ctx.chat.setMessages((prev) => [
  ...prev,
  {
    id: crypto.randomUUID(),
    role: "system",
    content: "...",
    timestamp: Date.now(),
  },
]);
```

**Fix:** Replace all 49 inline instances with `sysMsg(ctx, "...")`.

**Files:** `src/components/commands.ts`

---

## 2. 🔴 Git command handlers — 4 identical clones (HIGH — ~50 lines saved)

**Problem:** `/push`, `/pull`, `/stash`, `/stash pop` (lines 1756–1818) all follow the exact same structure:

```ts
sysMsg(ctx, "Pushing...");
gitPush(ctx.cwd).then((result) => {
  sysMsg(ctx, result.ok ? "Push complete." : `Push failed: ${result.output}`);
  ctx.refreshGit();
});
```

Only the function call, loading message, and success/fail text differ.

**Fix:** Extract a helper:

```ts
function runGitOp(
  ctx: CommandContext,
  fn: (cwd: string) => Promise<{ ok: boolean; output: string }>,
  loading: string,
  success: string,
  failPrefix: string,
): void {
  sysMsg(ctx, loading);
  fn(ctx.cwd).then((result) => {
    sysMsg(ctx, result.ok ? success : `${failPrefix}: ${result.output}`);
    ctx.refreshGit();
  });
}
```

**Files:** `src/components/commands.ts`

---

## 3. 🟡 `fmtTokens` / `fmtT` — identical function defined twice (MEDIUM)

**Problem:** Same token-formatting logic at line 1247 (`fmtTokens`) and line 1474 (`fmtT`):

```ts
const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};
```

**Fix:** Hoist to module-level `formatTokenCount(n: number): string` or move to a shared `src/utils/format.ts`.

**Files:** `src/components/commands.ts` (and potentially other consumers)

---

## 4. 🟡 `getFileDependents` / `getFileDependencies` — near-identical DB queries (MEDIUM)

**Problem:** Two methods in `RepoMap` (lines 1762–1792) that differ only in which edge column is the join vs filter:

```ts
// Dependents: JOIN files f ON f.id = e.source_file_id WHERE e.target_file_id = ?
// Dependencies: JOIN files f ON f.id = e.target_file_id WHERE e.source_file_id = ?
```

**Fix:** Extract a private method:

```ts
private queryEdges(
  relPath: string,
  direction: "dependents" | "dependencies",
): Array<{ path: string; weight: number }> {
  if (!this.ready) return [];
  const fileRow = this.db
    .query<{ id: number }, [string]>("SELECT id FROM files WHERE path = ?")
    .get(relPath);
  if (!fileRow) return [];
  const [joinCol, whereCol] =
    direction === "dependents"
      ? ["source_file_id", "target_file_id"]
      : ["target_file_id", "source_file_id"];
  return this.db
    .query<{ path: string; weight: number }, [number]>(
      `SELECT f.path, e.weight FROM edges e
       JOIN files f ON f.id = e.${joinCol}
       WHERE e.${whereCol} = ?
       ORDER BY e.weight DESC LIMIT 30`,
    )
    .all(fileRow.id);
}
```

Then the public methods become one-liners.

**Files:** `src/core/intelligence/repo-map.ts`

---

## 5. 🟡 `addDecision` / `addDiscovery` — duplicate "add-unique-to-capped-list" (MEDIUM)

**Problem:** Both methods in `WorkingStateManager` (lines 72–95) do the same thing — dedupe-push with cap eviction:

```ts
addDecision(d: string): void {
  if (!this.state.decisions.includes(d)) {
    this.state.decisions.push(d);
    if (this.state.decisions.length > MAX) this.state.decisions.shift();
  }
}
```

`addFailure` is slightly different (no dedup), so it stays separate.

**Fix:** Extract a private helper:

```ts
private addUnique(list: string[], item: string): void {
  if (!list.includes(item)) {
    list.push(item);
    if (list.length > WorkingStateManager.MAX_LIST_SIZE) list.shift();
  }
}
```

**Files:** `src/core/compaction/working-state.ts`

---

## 6. 🟢 Repo map scan error handler — duplicated `.catch()` block (LOW)

**Problem:** Identical 5-line `.catch()` handler at lines 230 and 561 in `ContextManager`:

```ts
.catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  this.repoMapReady = false;
  this.syncRepoMapStore("error");
  useRepoMapStore.getState().setScanError(`Repo map scan failed: ${msg}`);
});
```

**Fix:** Extract `private handleScanError(err: unknown): void`.

**Files:** `src/core/context/manager.ts`

---

## 7. 🟢 `keyFn` clones in tool dedup config (LOW)

**Problem:** Two identical `keyFn` lambdas (lines 1441 & 1450 in `tools/index.ts`) for `soul_analyze` and `soul_impact` that only differ in the tool name string:

```ts
keyFn: (a) => JSON.stringify(["soul_analyze", String(a.action ?? ""), normalizePath(String(a.file ?? ""))]),
keyFn: (a) => JSON.stringify(["soul_impact",  String(a.action ?? ""), normalizePath(String(a.file ?? ""))]),
```

**Fix:** Create a factory:

```ts
const makeActionFileKey = (name: string) => (a: Record<string, unknown>) =>
  JSON.stringify([name, String(a.action ?? ""), normalizePath(String(a.file ?? ""))]);
```

**Files:** `src/core/tools/index.ts`

---

## Execution Order

| Priority | Item | Est. Lines Saved | Effort |
|----------|------|-----------------|--------|
| 1 | sysMsg consolidation | ~250 | Medium (mechanical find-replace) |
| 2 | Git command helper | ~50 | Low |
| 3 | fmtTokens dedup | ~10 | Low |
| 4 | queryEdges helper | ~15 | Low |
| 5 | addUnique helper | ~10 | Low |
| 6 | handleScanError | ~8 | Low |
| 7 | keyFn factory | ~5 | Low |

Items 1–3 are all in `commands.ts` and should be done together. Items 4–7 are independent one-file changes.
