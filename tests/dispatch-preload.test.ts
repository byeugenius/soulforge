import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  parseTargetFileRange,
  normalizeTargetPath,
  buildPreloadedContent,
} from "../src/core/agents/subagent-tools.js";
import { initForbidden } from "../src/core/security/forbidden.js";

// ─── Fixtures ───

const TMP = join(tmpdir(), `dispatch-preload-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  initForbidden(TMP);

  // Small file — 10 lines
  writeFileSync(
    join(TMP, "small.ts"),
    Array.from({ length: 10 }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n"),
  );

  // Medium file — 100 lines
  writeFileSync(
    join(TMP, "medium.ts"),
    Array.from({ length: 100 }, (_, i) => `export function fn${i + 1}() { return ${i + 1}; }`).join("\n"),
  );

  // Large file — 600 lines (exceeds PRELOAD_FULL_FILE_MAX_LINES)
  writeFileSync(
    join(TMP, "large.ts"),
    Array.from({ length: 600 }, (_, i) => `// line ${i + 1}`).join("\n"),
  );

  // Nested file
  mkdirSync(join(TMP, "src", "core"), { recursive: true });
  writeFileSync(
    join(TMP, "src", "core", "utils.ts"),
    "export function hello() {\n  return 'world';\n}\n",
  );

  // Binary-ish file with no extension
  writeFileSync(join(TMP, "Makefile"), "all:\n\techo hello\n");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ─── parseTargetFileRange ───

describe("parseTargetFileRange", () => {
  it("returns plain path when no range suffix", () => {
    const result = parseTargetFileRange("src/core/tools/index.ts");
    expect(result).toEqual({ path: "src/core/tools/index.ts" });
    expect(result.startLine).toBeUndefined();
    expect(result.endLine).toBeUndefined();
  });

  it("parses start-end range", () => {
    const result = parseTargetFileRange("src/foo.ts:100-200");
    expect(result).toEqual({ path: "src/foo.ts", startLine: 100, endLine: 200 });
  });

  it("parses single line (start only)", () => {
    const result = parseTargetFileRange("src/bar.ts:42");
    expect(result).toEqual({ path: "src/bar.ts", startLine: 42, endLine: undefined });
  });

  it("handles deeply nested paths", () => {
    const result = parseTargetFileRange("src/core/agents/subagent-tools.ts:900-950");
    expect(result.path).toBe("src/core/agents/subagent-tools.ts");
    expect(result.startLine).toBe(900);
    expect(result.endLine).toBe(950);
  });

  it("handles paths with dots in directory names", () => {
    const result = parseTargetFileRange("node_modules/@ai-sdk/core/dist/index.js:10-20");
    expect(result.path).toBe("node_modules/@ai-sdk/core/dist/index.js");
    expect(result.startLine).toBe(10);
    expect(result.endLine).toBe(20);
  });

  it("does not parse range from extensionless files", () => {
    // Makefile:10 — no extension, so regex won't match
    const result = parseTargetFileRange("Makefile:10");
    expect(result.path).toBe("Makefile:10");
    expect(result.startLine).toBeUndefined();
  });

  it("handles line 1", () => {
    const result = parseTargetFileRange("a.ts:1-5");
    expect(result).toEqual({ path: "a.ts", startLine: 1, endLine: 5 });
  });

  it("handles large line numbers", () => {
    const result = parseTargetFileRange("big.ts:9999-10500");
    expect(result).toEqual({ path: "big.ts", startLine: 9999, endLine: 10500 });
  });
});

// ─── normalizeTargetPath ───

describe("normalizeTargetPath", () => {
  it("strips range suffix and normalizes", () => {
    const result = normalizeTargetPath("src/foo.ts:100-200");
    expect(result).toBe("src/foo.ts");
  });

  it("normalizes plain path", () => {
    const result = normalizeTargetPath("src/foo.ts");
    expect(result).toBe("src/foo.ts");
  });

  it("normalizes path with single line", () => {
    const result = normalizeTargetPath("src/bar.ts:42");
    expect(result).toBe("src/bar.ts");
  });

  it("strips leading ./", () => {
    const result = normalizeTargetPath("./src/foo.ts:10-20");
    expect(result).toBe("src/foo.ts");
  });
});

// ─── buildPreloadedContent ───

describe("buildPreloadedContent", () => {
  it("returns empty string for empty target list", async () => {
    const result = await buildPreloadedContent([], TMP);
    expect(result).toBe("");
  });

  it("preloads a small file in full with line numbers", async () => {
    const result = await buildPreloadedContent(["small.ts"], TMP);
    expect(result).toContain("--- Preloaded file contents");
    expect(result).toContain("── small.ts ──");
    expect(result).toContain("   1  const line1 = 1;");
    expect(result).toContain("  10  const line10 = 10;");
  });

  it("preloads a specific line range", async () => {
    const result = await buildPreloadedContent(["medium.ts:5-10"], TMP);
    expect(result).toContain("── medium.ts:5-10 ──");
    expect(result).toContain("   5  export function fn5()");
    expect(result).toContain("  10  export function fn10()");
    // Should NOT contain lines outside the range
    expect(result).not.toContain("fn1()");
    expect(result).not.toContain("fn11()");
  });

  it("preloads single line with default window of +50", async () => {
    const result = await buildPreloadedContent(["medium.ts:20"], TMP);
    // Single line → start=20, end=min(20+50, 100)=70
    expect(result).toContain("── medium.ts:20-70 ──");
    expect(result).toContain("  20  ");
    expect(result).toContain("  70  ");
    expect(result).not.toContain("  71  ");
  });

  it("skips files exceeding PRELOAD_FULL_FILE_MAX_LINES without range", async () => {
    const result = await buildPreloadedContent(["large.ts"], TMP);
    expect(result).toBe("");
  });

  it("preloads range from large file", async () => {
    const result = await buildPreloadedContent(["large.ts:100-150"], TMP);
    expect(result).toContain("── large.ts:100-150 ──");
    expect(result).toContain(" 100  // line 100");
    expect(result).toContain(" 150  // line 150");
  });

  it("preloads multiple files", async () => {
    const result = await buildPreloadedContent(
      ["small.ts", "src/core/utils.ts"],
      TMP,
    );
    expect(result).toContain("── small.ts ──");
    expect(result).toContain("── src/core/utils.ts ──");
    expect(result).toContain("export function hello()");
  });

  it("skips nonexistent files gracefully", async () => {
    const result = await buildPreloadedContent(
      ["nonexistent.ts", "small.ts"],
      TMP,
    );
    expect(result).toContain("── small.ts ──");
    expect(result).not.toContain("nonexistent");
  });

  it("skips files without extension (no dot in normalized path)", async () => {
    const result = await buildPreloadedContent(["Makefile"], TMP);
    expect(result).toBe("");
  });

  it("handles mixed ranges and full files", async () => {
    const result = await buildPreloadedContent(
      ["small.ts", "medium.ts:50-60"],
      TMP,
    );
    expect(result).toContain("── small.ts ──");
    expect(result).toContain("── medium.ts:50-60 ──");
    expect(result).toContain("  50  ");
    expect(result).toContain("  60  ");
  });

  it("clamps range to file bounds", async () => {
    // medium.ts has 100 lines, request 90-200
    const result = await buildPreloadedContent(["medium.ts:90-200"], TMP);
    expect(result).toContain("── medium.ts:90-100 ──");
    expect(result).toContain("  90  ");
    expect(result).toContain(" 100  ");
    // Line 101+ doesn't exist
    expect(result).not.toContain(" 101  ");
  });

  it("respects total character budget", async () => {
    // Create many files that together exceed 80k chars
    const bigDir = join(TMP, "budget-test");
    mkdirSync(bigDir, { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < 50; i++) {
      const name = `file${i}.ts`;
      // Each file ~2000 chars (400 lines × ~5 chars)
      writeFileSync(
        join(bigDir, name),
        Array.from({ length: 400 }, (_, j) => `// ${String(j).padStart(3, "0")}`).join("\n"),
      );
      files.push(name);
    }
    const result = await buildPreloadedContent(files, bigDir);
    // Should have some files but not all 50
    const sectionCount = (result.match(/── file\d+\.ts ──/g) || []).length;
    expect(sectionCount).toBeGreaterThan(0);
    expect(sectionCount).toBeLessThan(50);
    // Total should be under budget
    expect(result.length).toBeLessThanOrEqual(80_000 + 200); // small header overhead
  });

  it("output format matches read style (4-digit padded line numbers)", async () => {
    const result = await buildPreloadedContent(["small.ts"], TMP);
    const lines = result.split("\n");
    // Find a numbered line
    const numberedLine = lines.find((l) => l.match(/^\s+\d+\s{2}/));
    expect(numberedLine).toBeDefined();
    // Check format: "   1  const line1 = 1;"
    expect(numberedLine).toMatch(/^\s{1,4}\d+\s{2}/);
  });

  it("header uses positive framing", async () => {
    const result = await buildPreloadedContent(["small.ts"], TMP);
    expect(result).toContain("fresh and up-to-date");
    expect(result).toContain("proceed directly with edits");
    // No negative framing
    expect(result).not.toContain("do not");
    expect(result).not.toContain("don't");
    expect(result).not.toContain("DO NOT");
  });
});

// ─── Integration: code agent prompt selection ───

describe("code agent preload detection", () => {
  it("detects preloaded marker in task text", () => {
    const task = "Edit foo.ts\n\n--- Preloaded file contents (fresh) ---\n── foo.ts ──\n   1  hello";
    expect(task.includes("--- Preloaded file contents")).toBe(true);
  });

  it("does not false-positive on normal task text", () => {
    const task = "Edit foo.ts to add a new function. Target files: foo.ts, bar.ts";
    expect(task.includes("--- Preloaded file contents")).toBe(false);
  });
});