import { describe, expect, test } from "bun:test";

// Test the Soul Map snapshot + diff system for cache safety and correctness.
// These test the ContextManager methods that forge.ts prepareStep calls.

// Since ContextManager has many dependencies (RepoMap, SQLite, etc.),
// we test the logic via a minimal mock that mirrors the real behavior.

interface MockRepoMap {
  ready: boolean;
  files: Map<string, string[]>; // file → dependents
  rendered: string;
  /** Files that "exist on disk" — used for deletion detection */
  existingFiles?: Set<string>;
  /** Diff block data per file: blast radius + exported symbols with signatures */
  diffBlocks?: Map<string, { radiusTag: string; symbolBlock: string }>;
}

function createMockContextManager(repoMap: MockRepoMap) {
  const diffChangedFiles = new Map<string, number>();
  let diffSeq = 0;
  const snapshotPaths = new Set<string>();
  const diffBlocks = new Map<string, { radiusTag: string; symbolBlock: string }>();
  let snapshotClearCount = 0;
  let pendingDiff: string | null = null;
  let lastEmittedDiff: string | null = null;

  return {
    _diffSet: diffChangedFiles,
    _snapshotPaths: snapshotPaths,
    _snapshotClearCount: () => snapshotClearCount,

    onFileChanged(relPath: string) {
      diffChangedFiles.set(relPath, ++diffSeq);
      pendingDiff = null;

      // Simulate async prefetch of diff blocks
      const block = repoMap.diffBlocks?.get(relPath);
      if (block) {
        diffBlocks.set(relPath, block);
      }
    },

    buildSoulMapSnapshot(clearDiffTracker = true): string | null {
      if (!repoMap.ready) return null;
      if (!repoMap.rendered) return null;

      snapshotPaths.clear();
      for (const line of repoMap.rendered.split("\n")) {
        if (line.startsWith(" ") || line.startsWith("+") || !line.includes(":")) continue;
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) snapshotPaths.add(line.slice(0, colonIdx));
      }

      if (clearDiffTracker) {
        diffChangedFiles.clear();
        diffSeq = 0;
        diffBlocks.clear();
        pendingDiff = null;
        lastEmittedDiff = null;
        snapshotClearCount++;
      }
      return `<soul_map>${repoMap.rendered}</soul_map>`;
    },

    buildSoulMapDiff(): string | null {
      if (!repoMap.ready) return null;
      if (diffChangedFiles.size === 0) return null;

      if (!pendingDiff) {
        // Sort by most recent edit so the 15-file cap shows latest changes
          const changed = [...diffChangedFiles.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([path]) => path);
        const hasSnapshot = snapshotPaths.size > 0;
        const existingFiles = repoMap.existingFiles;
        const lines = ["<soul_map_update>"];
        const MAX_RICH_BLOCKS = 5;
        let richBlockCount = 0;

        for (const file of changed.slice(0, 15)) {
          const fileExists = existingFiles ? existingFiles.has(file) : true;
          const block = diffBlocks.get(file);

          if (!fileExists) {
            lines.push(`- ${file}`);
          } else if (hasSnapshot && !snapshotPaths.has(file)) {
            const tag = block ? `${file}:${block.radiusTag} [NEW FILE]` : `${file}: [NEW FILE]`;
            lines.push(tag);
            if (block?.symbolBlock && richBlockCount < MAX_RICH_BLOCKS) {
              lines.push(block.symbolBlock);
              richBlockCount++;
            }
          } else {
            const tag = block ? `${file}:${block.radiusTag}` : `${file}:`;
            lines.push(tag);
            if (block?.symbolBlock && richBlockCount < MAX_RICH_BLOCKS) {
              lines.push(block.symbolBlock);
              richBlockCount++;
            }
          }
        }
        if (changed.length > 15) lines.push(`(+${String(changed.length - 15)} more)`);
        lines.push("</soul_map_update>");
        pendingDiff = lines.join("\n");
      }

      if (pendingDiff === lastEmittedDiff) return null;
      return pendingDiff;
    },

    commitSoulMapDiff(): void {
      if (pendingDiff) {
        lastEmittedDiff = pendingDiff;
        pendingDiff = null;
      }
    },

    buildSkillsBlock(): string | null {
      return null;
    },

    buildCrossTabSection(): string | null {
      return null;
    },
  };
}

// Simulates forge prepareStep Soul Map logic
function simulatePrepareStep(
  ctx: ReturnType<typeof createMockContextManager>,
  stepNumber: number,
  snapshotSentRef: { value: boolean },
): string | null {
  if (!snapshotSentRef.value) {
    const snapshot = ctx.buildSoulMapSnapshot();
    if (snapshot) {
      snapshotSentRef.value = true;
      return snapshot;
    }
    return null;
  }
  const diff = ctx.buildSoulMapDiff();
  if (diff) ctx.commitSoulMapDiff();
  return diff;
}

describe("Soul Map snapshot + diff", () => {
  test("snapshot at step 0 clears diff tracker", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "file-tree" };
    const ctx = createMockContextManager(repo);

    ctx.onFileChanged("src/a.ts");
    ctx.onFileChanged("src/b.ts");
    expect(ctx._diffSet.size).toBe(2);

    const snapshot = ctx.buildSoulMapSnapshot();
    expect(snapshot).toContain("file-tree");
    expect(ctx._diffSet.size).toBe(0);
  });

  test("snapshot with clearDiffTracker=false preserves diff set", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "file-tree" };
    const ctx = createMockContextManager(repo);

    ctx.onFileChanged("src/a.ts");
    const snapshot = ctx.buildSoulMapSnapshot(false);
    expect(snapshot).toContain("file-tree");
    expect(ctx._diffSet.size).toBe(1);
  });

  test("diff returns null when no changes", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "file-tree" };
    const ctx = createMockContextManager(repo);

    expect(ctx.buildSoulMapDiff()).toBeNull();
  });

  test("diff shows modified files with file: format", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/a.ts: (→3)\n  +foo :10\nsrc/d.ts:\n  +bar :5",
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/a.ts");
    ctx.onFileChanged("src/d.ts");

    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("src/a.ts:");
    expect(diff).toContain("src/d.ts:");
      expect(diff).not.toContain("[NEW FILE]");
      // Set is NOT cleared — accumulates for cumulative diffs
      expect(ctx._diffSet.size).toBe(2);
  });

  test("diff caps at 15 files", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "file-tree" };
    const ctx = createMockContextManager(repo);

    for (let i = 0; i < 20; i++) {
      ctx.onFileChanged(`src/file-${String(i)}.ts`);
    }

    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("(+5 more)");
    expect(ctx._diffSet.size).toBe(20); // cumulative — not cleared
  });

  test("repeated edits to same file = one entry", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "file-tree" };
    const ctx = createMockContextManager(repo);

    for (let i = 0; i < 50; i++) {
      ctx.onFileChanged("src/hot-file.ts");
    }

    expect(ctx._diffSet.size).toBe(1);
    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("src/hot-file.ts");
    expect(diff).not.toContain("more");
  });

  test("snapshot returns null when repo map not ready", () => {
    const repo: MockRepoMap = { ready: false, files: new Map(), rendered: "" };
    const ctx = createMockContextManager(repo);

    expect(ctx.buildSoulMapSnapshot()).toBeNull();
  });

  test("diff returns null when repo map not ready — preserves changed files", () => {
    const repo: MockRepoMap = { ready: false, files: new Map(), rendered: "" };
    const ctx = createMockContextManager(repo);

    ctx.onFileChanged("src/a.ts");
    expect(ctx.buildSoulMapDiff()).toBeNull();
    expect(ctx._diffSet.size).toBe(1);
  });

  test("no duplicate diffs between steps", () => {
    const repo: MockRepoMap = {
        ready: true,
      files: new Map(),
        rendered: "src/a.ts:\n  +foo :1\nsrc/b.ts:\n  +bar :1",
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/a.ts");
    const diff1 = ctx.buildSoulMapDiff();
    expect(diff1).toContain("src/a.ts:");
    ctx.commitSoulMapDiff();

    // Second call with no new changes → null (coalesced — already emitted)
    const diff2 = ctx.buildSoulMapDiff();
    expect(diff2).toBeNull();

      // New change → cumulative diff with both files
    ctx.onFileChanged("src/b.ts");
    const diff3 = ctx.buildSoulMapDiff();
    expect(diff3).toContain("src/b.ts:");
    expect(diff3).toContain("src/a.ts:"); // cumulative
  });
});

describe("Soul Map mid-turn repo map readiness", () => {
  test("snapshot sent when repo map becomes ready mid-turn", () => {
    const repo: MockRepoMap = { ready: false, files: new Map(), rendered: "file-tree" };
    const ctx = createMockContextManager(repo);
    const snapshotSent = { value: false };

    // Step 0: repo map not ready
    const r0 = simulatePrepareStep(ctx, 0, snapshotSent);
    expect(r0).toBeNull();
    expect(snapshotSent.value).toBe(false);

    // Step 3: repo map becomes ready
    repo.ready = true;
    repo.rendered = "ready-tree";
    const r3 = simulatePrepareStep(ctx, 3, snapshotSent);
    expect(r3).toContain("ready-tree");
    expect(snapshotSent.value).toBe(true);

    // Step 4: now diffs
    ctx.onFileChanged("src/x.ts");
    const r4 = simulatePrepareStep(ctx, 4, snapshotSent);
    expect(r4).toContain("src/x.ts");
    expect(r4).toContain("soul_map_update");
  });

  test("accumulated changes during scan are cleared by snapshot", () => {
    const repo: MockRepoMap = { ready: false, files: new Map(), rendered: "" };
    const ctx = createMockContextManager(repo);
    const snapshotSent = { value: false };

    // Files changed while scanning
    ctx.onFileChanged("src/a.ts");
    ctx.onFileChanged("src/b.ts");
    expect(ctx._diffSet.size).toBe(2);

    // Step 0: not ready
    simulatePrepareStep(ctx, 0, snapshotSent);

    // Scan completes
    repo.ready = true;
    repo.rendered = "full-tree";

    // Step 2: snapshot sent, clears accumulated changes
    simulatePrepareStep(ctx, 2, snapshotSent);
    expect(ctx._diffSet.size).toBe(0);
    expect(snapshotSent.value).toBe(true);
  });
});

describe("Soul Map cross-tab behavior", () => {
  test("edits from other tabs accumulate in diff", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "tree" };
    const ctxA = createMockContextManager(repo);
    const ctxB = createMockContextManager(repo);
    const snapshotA = { value: false };

    // Tab A sends snapshot
    simulatePrepareStep(ctxA, 0, snapshotA);
    expect(snapshotA.value).toBe(true);

    // Tab B edits a file — both CMs get notified in real system
    // In this test, we simulate by calling onFileChanged on both
    ctxA.onFileChanged("src/edited-by-b.ts");
    ctxB.onFileChanged("src/edited-by-b.ts");

    // Tab A's next step sees the edit
    const diff = simulatePrepareStep(ctxA, 1, snapshotA);
    expect(diff).toContain("src/edited-by-b.ts");
  });
});

describe("Soul Map subagent dispatch", () => {
  test("multiple subagent edits appear in one diff", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "tree" };
    const ctx = createMockContextManager(repo);
    const snapshotSent = { value: true }; // Already sent

    // Simulate 5 subagent file edits during one dispatch
    ctx.onFileChanged("src/agent1-edit.ts");
    ctx.onFileChanged("src/agent2-edit.ts");
    ctx.onFileChanged("src/agent3-edit.ts");
    ctx.onFileChanged("src/shared-file.ts");
    ctx.onFileChanged("src/agent1-edit.ts"); // Duplicate — ignored

    expect(ctx._diffSet.size).toBe(4);

    const diff = simulatePrepareStep(ctx, 5, snapshotSent);
    expect(diff).toContain("agent1-edit");
    expect(diff).toContain("agent2-edit");
    expect(diff).toContain("agent3-edit");
    expect(diff).toContain("shared-file");
    expect(ctx._diffSet.size).toBe(4); // cumulative — not cleared
  });
});

describe("Soul Map long sessions", () => {
  test("cumulative diffs grow but identical diffs are not re-emitted", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "tree" };
    const ctx = createMockContextManager(repo);
    const snapshotSent = { value: true };

    for (let step = 1; step <= 50; step++) {
      ctx.onFileChanged(`src/step-${String(step)}.ts`);
      const diff = simulatePrepareStep(ctx, step, snapshotSent);
      // Each step adds a new file → diff changes → emitted (not coalesced)
      expect(diff).not.toBeNull();
      // Cumulative: set grows with each step
      expect(ctx._diffSet.size).toBe(step);
    }

    // No new changes → null (coalesced)
    const noDiff = simulatePrepareStep(ctx, 51, snapshotSent);
    expect(noDiff).toBeNull();
  });

  test("steps with no file changes produce no diff", () => {
    const repo: MockRepoMap = { ready: true, files: new Map(), rendered: "tree" };
    const ctx = createMockContextManager(repo);
    const snapshotSent = { value: true };

    const diff = simulatePrepareStep(ctx, 10, snapshotSent);
    expect(diff).toBeNull();
  });
});

describe("Soul Map smart diff markers", () => {
  test("new files get [NEW FILE] tag", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/existing.ts:\n  +foo :1",
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/existing.ts");
    ctx.onFileChanged("src/brand-new.ts");

    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("src/existing.ts:");
    expect(diff).not.toContain("src/existing.ts: [NEW FILE]");
    expect(diff).toContain("src/brand-new.ts: [NEW FILE]");
  });

  test("new files include rich blocks with blast radius and signatures", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/existing.ts:\n  +foo :1",
      diffBlocks: new Map([
        ["src/new-module.ts", {
          radiusTag: " (→3)",
          symbolBlock: "  +class MyClass :5\n  +function helperFn(x: string): boolean :20",
        }],
      ]),
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/new-module.ts");

    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("src/new-module.ts: (→3) [NEW FILE]");
    expect(diff).toContain("+class MyClass :5");
    expect(diff).toContain("+function helperFn(x: string): boolean :20");
  });

  test("modified files include rich blocks with blast radius and signatures", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/statusbar.ts:\n  +computeCost :267",
      diffBlocks: new Map([
        ["src/statusbar.ts", {
          radiusTag: " (→15)",
          symbolBlock: "  +function computeCost(usage: TokenUsage, modelId: string): number :267\n  +function isModelFree(modelId: string): boolean :194",
        }],
      ]),
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/statusbar.ts");

    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("src/statusbar.ts: (→15)");
    expect(diff).not.toContain("[NEW FILE]");
    expect(diff).toContain("+function computeCost(usage: TokenUsage, modelId: string): number :267");
    expect(diff).toContain("+function isModelFree(modelId: string): boolean :194");
  });

  test("deleted files get - marker", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/will-delete.ts:\n  +foo :1\nsrc/stays.ts:\n  +bar :1",
      existingFiles: new Set(["src/stays.ts"]),
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/will-delete.ts");
    ctx.onFileChanged("src/stays.ts");

    const diff = ctx.buildSoulMapDiff();
    expect(diff).toContain("- src/will-delete.ts");
    expect(diff).toContain("src/stays.ts:");
    expect(diff).not.toContain("- src/stays.ts");
  });

  test("snapshot extracts file paths correctly", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: [
        "src/boot.tsx: (→89) [NEW]",
        "  +export function main :10",
        "src/types/index.ts: (→40)",
        "  +export interface Config :5",
        "",
        "src/utils/helpers.ts:",
        "  +export function helper :1",
      ].join("\n"),
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    expect(ctx._snapshotPaths.has("src/boot.tsx")).toBe(true);
    expect(ctx._snapshotPaths.has("src/types/index.ts")).toBe(true);
    expect(ctx._snapshotPaths.has("src/utils/helpers.ts")).toBe(true);
    expect(ctx._snapshotPaths.size).toBe(3);
  });

  test("rich block cap at 5 files", () => {
    const diffBlocks = new Map<string, { radiusTag: string; symbolBlock: string }>();
    for (let i = 0; i < 8; i++) {
      diffBlocks.set(`src/new-${String(i)}.ts`, {
        radiusTag: "",
        symbolBlock: `  +function fn${String(i)}(): void :1`,
      });
    }
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/existing.ts:\n  +foo :1",
      diffBlocks,
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    for (let i = 0; i < 8; i++) {
      ctx.onFileChanged(`src/new-${String(i)}.ts`);
    }

    const diff = ctx.buildSoulMapDiff()!;
    // Count how many files have symbol blocks (lines starting with "  +")
    const symbolBlockLines = diff.split("\n").filter((l) => l.startsWith("  +"));
    expect(symbolBlockLines.length).toBeLessThanOrEqual(5);
    // All 8 files should still appear as [NEW FILE]
    for (let i = 0; i < 8; i++) {
      expect(diff).toContain(`src/new-${String(i)}.ts:`);
    }
  });

  test("mixed scenario: modified + new + deleted in one diff", () => {
    const repo: MockRepoMap = {
      ready: true,
      files: new Map(),
      rendered: "src/app.ts:\n  +main :1\nsrc/old.ts:\n  +legacy :1",
      existingFiles: new Set(["src/app.ts", "src/fresh.ts"]),
      diffBlocks: new Map([
        ["src/app.ts", { radiusTag: " (→5)", symbolBlock: "  +function main(): void :1" }],
        ["src/fresh.ts", { radiusTag: "", symbolBlock: "  +function newFeature(): void :10" }],
      ]),
    };
    const ctx = createMockContextManager(repo);
    ctx.buildSoulMapSnapshot();

    ctx.onFileChanged("src/app.ts"); // modified
    ctx.onFileChanged("src/old.ts"); // deleted
    ctx.onFileChanged("src/fresh.ts"); // new

    const diff = ctx.buildSoulMapDiff()!;
    expect(diff).toContain("src/app.ts: (→5)");
    expect(diff).not.toContain("src/app.ts: (→5) [NEW FILE]");
    expect(diff).toContain("- src/old.ts");
    expect(diff).toContain("src/fresh.ts: [NEW FILE]");
    expect(diff).toContain("+function newFeature(): void :10");
    expect(diff).toContain("+function main(): void :1");
  });
});
