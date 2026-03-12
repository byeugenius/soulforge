import { create } from "zustand";

export type CompactionEventKind = "compact" | "strategy-change" | "auto-trigger" | "error";

export interface CompactionLogEntry {
  id: string;
  kind: CompactionEventKind;
  message: string;
  timestamp: number;
  model?: string;
  strategy?: string;
  slotsBefore?: number;
  contextBefore?: string;
  contextAfter?: string;
  messagesBefore?: number;
  messagesAfter?: number;
  summarySnippet?: string;
  summaryLength?: number;
}

type LogExtra = Omit<CompactionLogEntry, "id" | "kind" | "message" | "timestamp">;

interface CompactionLogState {
  entries: CompactionLogEntry[];
  push: (kind: CompactionEventKind, message: string, extra?: LogExtra) => void;
  clear: () => void;
}

export const useCompactionLogStore = create<CompactionLogState>()((set) => ({
  entries: [],
  push: (kind, message, extra) =>
    set((s) => ({
      entries: [
        ...s.entries,
        {
          id: crypto.randomUUID(),
          kind,
          message,
          timestamp: Date.now(),
          ...extra,
        },
      ],
    })),
  clear: () => set({ entries: [] }),
}));

export function logCompaction(kind: CompactionEventKind, message: string, extra?: LogExtra): void {
  useCompactionLogStore.getState().push(kind, message, extra);
}
