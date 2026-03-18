import { resolve } from "node:path";
import type { FileReadRecord } from "./agent-bus.js";
import { normalizeArgs } from "./recall-store.js";

interface ReadRecord {
  tool: string;
  normalizedKey: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  step: number;
  recallId: string;
  fromSubagent: boolean;
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

export class ReadTracker {
  private records = new Map<string, ReadRecord>();
  private pathIndex = new Map<string, Set<string>>();

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

    if (existing.fromSubagent) {
      return "This file was read by a subagent during dispatch. The findings are in your context above.";
    }

    if (READ_CODE_TOOLS.has(toolName)) {
      return `You read this symbol at step ${String(existing.step)}. Use recall('${existing.recallId}') for the content.`;
    }

    if (GREP_TOOLS.has(toolName)) {
      return `You already searched for this pattern at step ${String(existing.step)}. See recall('${existing.recallId}') for results. Set fresh: true to re-execute.`;
    }

    if (GLOB_TOOLS.has(toolName)) {
      return `You already ran this search at step ${String(existing.step)}. See recall('${existing.recallId}') for results. Set fresh: true to re-execute.`;
    }

    if (NAVIGATE_TOOLS.has(toolName)) {
      return `You already navigated this at step ${String(existing.step)}. See recall('${existing.recallId}') for results.`;
    }

    return `You already ran this at step ${String(existing.step)}. See recall('${existing.recallId}') for results.`;
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

      if (rangeCovers(rec, { startLine: requestedStart, endLine: requestedEnd })) {
        if (rec.fromSubagent) {
          return "This file was read by a subagent during dispatch. The findings are in your context above.";
        }
        const rangeDesc =
          rec.startLine == null && rec.endLine == null
            ? "full file"
            : `lines ${String(rec.startLine ?? 1)}-${String(rec.endLine ?? "end")}`;
        return `You read this file at step ${String(rec.step)} (${rangeDesc}). Use recall('${rec.recallId}') for the content, or read_code for specific symbols.`;
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
