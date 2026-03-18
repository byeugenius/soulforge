import { resolve } from "node:path";

export interface RecallEntry {
  id: string;
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  normalizedArgs: string;
  result: string;
  step: number;
  timestamp: number;
}

const PATH_KEYS = new Set(["path", "file", "filePath", "from", "to", "cwd"]);
const MAX_RESULT_BYTES = 50 * 1024 * 1024;

export function normalizeArgs(toolName: string, args: Record<string, unknown>): string {
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

export class RecallStore {
  private entries = new Map<string, RecallEntry>();
  private tupleIndex = new Map<string, string>();
  private counter = 0;
  private totalBytes = 0;
  private insertionOrder: string[] = [];

  record(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    result: string,
    step: number,
  ): string {
    const normalized = normalizeArgs(toolName, args);
    const existing = this.tupleIndex.get(normalized);
    if (existing) {
      const entry = this.entries.get(existing);
      if (entry) {
        this.totalBytes -= entry.result.length;
        entry.result = result;
        entry.step = step;
        entry.timestamp = Date.now();
        entry.toolCallId = toolCallId;
        this.totalBytes += result.length;
        this.evictIfNeeded();
        return entry.id;
      }
    }

    this.counter++;
    const id = `r${String(this.counter)}`;
    const entry: RecallEntry = {
      id,
      toolCallId,
      tool: toolName,
      args,
      normalizedArgs: normalized,
      result,
      step,
      timestamp: Date.now(),
    };
    this.entries.set(id, entry);
    this.tupleIndex.set(normalized, id);
    this.insertionOrder.push(id);
    this.totalBytes += result.length;
    this.evictIfNeeded();
    return id;
  }

  get(recallId: string): RecallEntry | undefined {
    return this.entries.get(recallId);
  }

  getByTuple(toolName: string, normalizedArgs: string): RecallEntry | undefined {
    const key = normalizedArgs.startsWith(`${toolName}:`)
      ? normalizedArgs
      : `${toolName}:${normalizedArgs}`;
    const id = this.tupleIndex.get(key);
    return id ? this.entries.get(id) : undefined;
  }

  clear(): void {
    this.entries.clear();
    this.tupleIndex.clear();
    this.insertionOrder = [];
    this.totalBytes = 0;
  }

  size(): number {
    return this.entries.size;
  }

  private evictIfNeeded(): void {
    while (this.totalBytes > MAX_RESULT_BYTES && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift();
      if (!oldest) break;
      const entry = this.entries.get(oldest);
      if (!entry) continue;
      this.totalBytes -= entry.result.length;
      this.entries.delete(oldest);
      this.tupleIndex.delete(entry.normalizedArgs);
    }
  }
}
