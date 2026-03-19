import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { FileReadRecord } from "./agent-bus.js";

const PATH_KEYS = new Set(["path", "file", "filePath", "from", "to", "cwd"]);

function normalizeArgs(toolName: string, args: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(args).sort()) {
    let val = args[key];
    if (PATH_KEYS.has(key) && typeof val === "string") {
      val = resolve(val);
    }
    sorted[key] = val;
  }
  return `${toolName}:${JSON.stringify(sorted)}`;
}

interface ReadRecord {
  tool: string;
  normalizedKey: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  step: number;
  recallId: string;
  fromSubagent: boolean;
  mtimeMs?: number;
}

const READ_FILE_TOOLS = new Set(["read_file"]);
const READ_CODE_TOOLS = new Set(["read_code"]);
const GREP_TOOLS = new Set(["grep", "soul_grep"]);
const GLOB_TOOLS = new Set(["glob", "soul_find"]);
const NAVIGATE_TOOLS = new Set(["navigate"]);

function extractPath(args: Record<string, unknown>): string | undefined {
  const raw = args.path ?? args.file ?? args.filePath;
  if (typeof raw === "string") return resolve(raw);
  return undefined;
}

function getMtimeMs(filePath: string): number | undefined {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return undefined;
  }
}

function isMtimeStale(rec: ReadRecord): boolean {
  if (!rec.path || rec.mtimeMs == null) return false;
  const current = getMtimeMs(rec.path);
  return current != null && current !== rec.mtimeMs;
}

function rangeCovers(
  existing: { startLine?: number; endLine?: number },
  requested: { startLine?: number; endLine?: number },
): boolean {
  const eStart = existing.startLine ?? 1;
  const eEnd = existing.endLine ?? Number.MAX_SAFE_INTEGER;
  const rStart = requested.startLine ?? 1;
  const rEnd = requested.endLine ?? Number.MAX_SAFE_INTEGER;
  return eStart <= rStart && eEnd >= rEnd;
}

export type ReadTrackerMode = "main" | "subagent";

export class ReadTracker {
  private records = new Map<string, ReadRecord>();
  private pathIndex = new Map<string, Set<string>>();
  private mode: ReadTrackerMode;

  constructor(mode: ReadTrackerMode = "main") {
    this.mode = mode;
  }

  check(toolName: string, args: Record<string, unknown>, _currentStep: number): string | null {
    if (args.fresh === true) {
      const key = normalizeArgs(toolName, args);
      this.removeByKey(key);
      return null;
    }

    if (READ_FILE_TOOLS.has(toolName)) {
      return this.checkReadFile(args);
    }

    const key = normalizeArgs(toolName, args);
    const existing = this.records.get(key);
    if (!existing) return null;

    if (existing.path && isMtimeStale(existing)) {
      this.invalidateFile(existing.path);
      return null;
    }

    if (existing.fromSubagent) {
      return "This file was read by a subagent during dispatch. The findings are in your context above.";
    }

    const step = String(existing.step);
    const hint =
      this.mode === "subagent"
        ? "The content is in your context above. Use read_file with target + name for specific symbols."
        : `Use recall('${existing.recallId}') for the content.`;
    const freshHint = this.mode === "subagent" ? "" : " Set fresh: true to re-execute.";

    if (READ_CODE_TOOLS.has(toolName)) {
      return `You read this symbol at step ${step}. ${hint}`;
    }

    if (GREP_TOOLS.has(toolName)) {
      return `You already searched for this pattern at step ${step}. ${hint}${freshHint}`;
    }

    if (GLOB_TOOLS.has(toolName)) {
      return `You already ran this search at step ${step}. ${hint}${freshHint}`;
    }

    if (NAVIGATE_TOOLS.has(toolName)) {
      return `You already navigated this at step ${step}. ${hint}`;
    }

    return `You already ran this at step ${step}. ${hint}`;
  }

  record(toolName: string, args: Record<string, unknown>, step: number, recallId: string): void {
    const key = normalizeArgs(toolName, args);
    const path = extractPath(args);
    const rec: ReadRecord = {
      tool: toolName,
      normalizedKey: key,
      path,
      step,
      recallId,
      fromSubagent: false,
      mtimeMs: path ? getMtimeMs(path) : undefined,
    };

    if (READ_FILE_TOOLS.has(toolName)) {
      rec.startLine = typeof args.startLine === "number" ? args.startLine : undefined;
      rec.endLine = typeof args.endLine === "number" ? args.endLine : undefined;
    }

    this.records.set(key, rec);
    if (path) {
      let set = this.pathIndex.get(path);
      if (!set) {
        set = new Set();
        this.pathIndex.set(path, set);
      }
      set.add(key);
    }
  }

  invalidateFile(filePath: string): void {
    const resolved = resolve(filePath);
    const keys = this.pathIndex.get(resolved);
    if (!keys) return;
    for (const key of keys) {
      this.records.delete(key);
    }
    this.pathIndex.delete(resolved);

    for (const [key, rec] of this.records) {
      if (!rec.path) continue;
      if (GREP_TOOLS.has(rec.tool)) {
        if (resolved.startsWith(rec.path) || rec.path === resolved) {
          this.removeByKey(key);
        }
      }
    }
  }

  registerSubagentReads(reads: FileReadRecord[], step: number): void {
    for (const r of reads) {
      const path = resolve(r.path);
      const args: Record<string, unknown> = { path: r.path };
      if (r.tool === "read_code") {
        if (r.target) args.target = r.target;
        if (r.name) args.name = r.name;
      }
      if (r.startLine != null) args.startLine = r.startLine;
      if (r.endLine != null) args.endLine = r.endLine;

      const key = normalizeArgs(r.tool, args);
      const rec: ReadRecord = {
        tool: r.tool,
        normalizedKey: key,
        path,
        startLine: r.startLine,
        endLine: r.endLine,
        step,
        recallId: "",
        fromSubagent: true,
      };
      this.records.set(key, rec);
      let set = this.pathIndex.get(path);
      if (!set) {
        set = new Set();
        this.pathIndex.set(path, set);
      }
      set.add(key);
    }
  }

  clear(): void {
    this.records.clear();
    this.pathIndex.clear();
  }

  private checkReadFile(args: Record<string, unknown>): string | null {
    const path = extractPath(args);
    if (!path) return null;

    const keys = this.pathIndex.get(path);
    if (!keys) return null;

    const requestedStart = typeof args.startLine === "number" ? args.startLine : undefined;
    const requestedEnd = typeof args.endLine === "number" ? args.endLine : undefined;

    for (const key of keys) {
      const rec = this.records.get(key);
      if (!rec || !READ_FILE_TOOLS.has(rec.tool)) continue;

      if (isMtimeStale(rec)) {
        this.invalidateFile(path);
        return null;
      }

      if (rangeCovers(rec, { startLine: requestedStart, endLine: requestedEnd })) {
        if (rec.fromSubagent) {
          return "This file was read by a subagent during dispatch. The findings are in your context above.";
        }
        const rangeDesc =
          rec.startLine == null && rec.endLine == null
            ? "full file"
            : `lines ${String(rec.startLine ?? 1)}-${String(rec.endLine ?? "end")}`;
        const hint =
          this.mode === "subagent"
            ? "The content is in your context above. Use read_file with target + name for specific symbols."
            : `Use recall('${rec.recallId}') for the content, or read_file with target + name for specific symbols.`;
        return `You read this file at step ${String(rec.step)} (${rangeDesc}). ${hint}`;
      }
    }
    return null;
  }

  private removeByKey(key: string): void {
    const rec = this.records.get(key);
    if (!rec) return;
    this.records.delete(key);
    if (rec.path) {
      const set = this.pathIndex.get(rec.path);
      if (set) {
        set.delete(key);
        if (set.size === 0) this.pathIndex.delete(rec.path);
      }
    }
  }
}
