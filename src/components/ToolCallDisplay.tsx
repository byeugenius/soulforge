import { TextAttributes } from "@opentui/core";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentStatsEvent,
  type MultiAgentEvent,
  onAgentStats,
  onMultiAgentEvent,
  onSubagentStep,
  type SubagentStep,
} from "../core/agents/subagent-events.js";
import {
  CATEGORY_COLORS,
  getBackendLabel,
  TOOL_CATEGORIES,
  TOOL_ICON_COLORS,
  TOOL_ICONS,
  TOOL_LABELS,
  type ToolCategory,
} from "../core/tool-display.js";
import type { PlanOutput } from "../types/index.js";
import { DiffView } from "./DiffView.js";
import { StructuredPlanView } from "./StructuredPlanView.js";
import { SPINNER_FRAMES, useSpinnerFrame } from "./shared.js";

export interface LiveToolCall {
  id: string;
  toolName: string;
  state: "running" | "done" | "error";
  args?: string;
  result?: string;
  error?: string;
  /** Set at tool-call start when the backend is known upfront (e.g. routed web search agent). */
  backend?: string;
}

const SUBAGENT_NAMES = new Set(["dispatch", "web_search"]);

const COLORS = {
  spinnerActive: "#9B30FF",
  toolNameActive: "#9B30FF",
  argsActive: "#aaa",
  checkDone: "#4a7",
  textDone: "#555",
  error: "#f44",
} as const;

const RENDER_DEBOUNCE = 32;

function backendLabel(tag: string): string {
  return getBackendLabel(tag);
}

function formatArgs(toolName: string, args?: string): string {
  if (!args) return "";
  try {
    const parsed = JSON.parse(args);
    if (toolName === "read_file" && parsed.path) return parsed.path;
    if (toolName === "edit_file" && parsed.path) return parsed.path;
    if (toolName === "shell" && parsed.command) {
      const cmd = String(parsed.command);
      return cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd;
    }
    if (toolName === "grep" && parsed.pattern) return `/${parsed.pattern}/`;
    if (toolName === "glob" && parsed.pattern) return parsed.pattern;
    if (toolName === "web_search" && parsed.query) {
      const q = String(parsed.query);
      return q.length > 50 ? `${q.slice(0, 47)}...` : q;
    }
    if (toolName === "memory_write" && parsed.summary) {
      const s = String(parsed.summary);
      return s.length > 50 ? `${s.slice(0, 47)}...` : s;
    }
    if (toolName === "dispatch" && parsed.tasks) {
      const tasks = parsed.tasks as Array<{ task: string }>;
      if (tasks.length === 1 && tasks[0]) {
        const t = String(tasks[0].task);
        return t.length > 50 ? `${t.slice(0, 47)}...` : t;
      }
      const obj = parsed.objective ? String(parsed.objective) : `${String(tasks.length)} agents`;
      const label = parsed.objective ? `${String(tasks.length)} agents — ${obj}` : obj;
      return label.length > 60 ? `${label.slice(0, 57)}...` : label;
    }
    if (toolName === "editor_read" && parsed.startLine) {
      return `lines ${String(parsed.startLine)}-${String(parsed.endLine ?? "end")}`;
    }
    if (toolName === "editor_edit" && parsed.startLine) {
      return `lines ${String(parsed.startLine)}-${String(parsed.endLine)}`;
    }
    if (toolName === "editor_navigate") {
      if (parsed.file) return String(parsed.file);
      if (parsed.search) return `/${String(parsed.search)}/`;
      if (parsed.line) return `line ${String(parsed.line)}`;
    }
    if (toolName === "editor_hover" && parsed.line) {
      return `line ${String(parsed.line)}:${String(parsed.col ?? "")}`;
    }
    if (toolName === "update_plan_step" && parsed.stepId) {
      return `${String(parsed.stepId)} → ${String(parsed.status ?? "")}`;
    }
    if (toolName === "ask_user" && parsed.question) {
      const q = String(parsed.question);
      return q.length > 50 ? `${q.slice(0, 47)}...` : q;
    }
    if (toolName === "read_code" && parsed.file) {
      const label = parsed.name
        ? `${String(parsed.name)} in ${String(parsed.file)}`
        : String(parsed.file);
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "navigate") {
      const parts = [parsed.action, parsed.symbol, parsed.file].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "analyze") {
      const parts = [parsed.action, parsed.symbol ?? parsed.file].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "rename_symbol") {
      const label = `${String(parsed.symbol ?? "")} → ${String(parsed.newName ?? "")}`;
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "refactor") {
      const parts = [parsed.action, parsed.symbol].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "project") {
      const parts = [parsed.action, parsed.file].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "move_symbol") {
      const label = `${String(parsed.symbol ?? "")} → ${String(parsed.to ?? "")}`;
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "discover_pattern" && parsed.query) {
      return String(parsed.query);
    }
    if (toolName === "test_scaffold" && parsed.file) {
      return String(parsed.file);
    }
    if (toolName === "write_plan" || toolName === "plan") {
      if (parsed.title) return String(parsed.title);
      return "plan";
    }
    if (toolName === "git_commit" && parsed.message) {
      const m = String(parsed.message);
      return m.length > 50 ? `${m.slice(0, 47)}...` : m;
    }
    if (toolName === "git_log" && parsed.count) return `last ${String(parsed.count)}`;
    if (toolName === "git_diff") return parsed.staged ? "staged" : "unstaged";
    if (toolName === "git_stash") return parsed.pop ? "pop" : "push";
    if (toolName === "code_execution") {
      if (parsed.code) {
        const code = String(parsed.code);
        return code.length > 60 ? `${code.slice(0, 57)}...` : code;
      }
      if (parsed.command) {
        const cmd = String(parsed.command);
        return cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd;
      }
    }
  } catch {
    // partial JSON during streaming
  }
  return "";
}

function formatResult(toolName: string, result?: string): string {
  if (!result) return "";
  try {
    const p = JSON.parse(result);
    if (p.repoMapHit && p.output) {
      const out = String(p.output);
      const match = out.match(/indexed at ([^\s]+)/);
      return match ? `→ ${match[1]}` : out.slice(0, 40);
    }
    if (p.output && typeof p.output === "string" && p.output.startsWith("[from dispatch cache]")) {
      const lines = p.output.split("\n").length - 1;
      return `${String(lines)} lines [cached]`;
    }
  } catch {
    // not JSON
  }
  if (SUBAGENT_NAMES.has(toolName)) {
    try {
      const p = JSON.parse(result);
      if (p.success === false && p.error) return String(p.error).slice(0, 50);
      if (Array.isArray(p.reads)) {
        const paths = new Set((p.reads as Array<{ path: string }>).map((r) => r.path));
        const parts: string[] = [];
        if (paths.size > 0) parts.push(`${String(paths.size)} files read`);
        if (Array.isArray(p.filesEdited) && p.filesEdited.length > 0)
          parts.push(`${String(p.filesEdited.length)} edited`);
        return parts.join(", ") || "done";
      }
      if (p.output) {
        const out = String(p.output);
        const lines = out.split("\n").length;
        if (lines > 1) return `${String(lines)} lines`;
        return out.length > 40 ? `${out.slice(0, 37)}...` : out;
      }
    } catch {
      // not JSON, fall through
    }
    const lines = result.split("\n").length;
    if (lines > 1) return `${String(lines)} lines`;
    return result.length > 40 ? `${result.slice(0, 37)}...` : result;
  }
  if (toolName === "code_execution") {
    const lines = result.split("\n").length;
    if (lines > 1) return `${String(lines)} lines output`;
    return result.length > 40 ? `${result.slice(0, 37)}...` : result;
  }
  try {
    const parsed = JSON.parse(result);
    if (parsed.output) {
      const out = String(parsed.output);
      const lines = out.split("\n").length;
      if (lines > 1) return `${String(lines)} lines`;
      return out.length > 40 ? `${out.slice(0, 37)}...` : out;
    }
    if (parsed.error) return String(parsed.error).slice(0, 50);
    if (parsed.branch !== undefined) {
      const parts = [parsed.branch as string];
      const counts: string[] = [];
      if (Array.isArray(parsed.staged) && parsed.staged.length > 0)
        counts.push(`${String(parsed.staged.length)} staged`);
      if (Array.isArray(parsed.modified) && parsed.modified.length > 0)
        counts.push(`${String(parsed.modified.length)} modified`);
      if (Array.isArray(parsed.untracked) && parsed.untracked.length > 0)
        counts.push(`${String(parsed.untracked.length)} untracked`);
      if (counts.length > 0) parts.push(counts.join(", "));
      else if (parsed.isDirty === false) parts.push("clean");
      return parts.join(" · ");
    }
    if (parsed.ok !== undefined) {
      const label = parsed.ok ? "ok" : "failed";
      if (parsed.output) {
        const firstLine = String(parsed.output).split("\n")[0] ?? "";
        const out = firstLine.length > 30 ? `${firstLine.slice(0, 27)}...` : firstLine;
        return out ? `${label} · ${out}` : label;
      }
      return label;
    }
  } catch {
    // fallback
  }
  const lines = result.split("\n").length;
  if (lines > 3) return `${String(lines)} lines`;
  return result.length > 40 ? `${result.slice(0, 37)}...` : result;
}

const Spinner = memo(function Spinner({ color }: { color?: string }) {
  const frame = useSpinnerFrame();
  return <span fg={color ?? COLORS.spinnerActive}>{SPINNER_FRAMES[frame]}</span>;
});

function useElapsedTimers(calls: LiveToolCall[]) {
  const startTimes = useRef(new Map<string, number>());
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const [elapsed, setElapsed] = useState(new Map<string, number>());

  useEffect(() => {
    const activeIds = new Set<string>();
    for (const call of calls) {
      activeIds.add(call.id);
      if (call.state === "running" && !startTimes.current.has(call.id)) {
        startTimes.current.set(call.id, Date.now());
      }
    }
    for (const id of startTimes.current.keys()) {
      if (!activeIds.has(id)) startTimes.current.delete(id);
    }
  }, [calls]);

  const hasRunning = calls.some((c) => c.state === "running");

  useEffect(() => {
    if (!hasRunning) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsed((prev) => {
        let changed = false;
        const next = new Map<string, number>();
        for (const call of callsRef.current) {
          const start = startTimes.current.get(call.id);
          if (start) {
            const secs = Math.floor((now - start) / 1000);
            next.set(call.id, secs);
            if (prev.get(call.id) !== secs) changed = true;
          }
        }
        if (!changed && prev.size === next.size) return prev;
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasRunning]);

  return elapsed;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${String(mins)}m ${String(secs)}s` : `${String(mins)}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${String(hrs)}h ${String(remMins)}m` : `${String(hrs)}h`;
}

const StatusIcon = memo(function StatusIcon({ state }: { state: LiveToolCall["state"] }) {
  if (state === "running") return <Spinner />;
  if (state === "done") return <span fg={COLORS.checkDone}>✓</span>;
  return <span fg={COLORS.error}>✗</span>;
});

interface DispatchDisplayData {
  steps: SubagentStep[];
  progress: MultiAgentState | null;
  stats: Map<string, AgentStatsEvent>;
}

const EMPTY_DISPATCH: DispatchDisplayData = {
  steps: [],
  progress: null,
  stats: new Map(),
};

interface ParsedTask {
  agentId: string;
  role?: string;
  task?: string;
}

function useDispatchDisplay(
  parentId: string | null,
  maxSteps: number,
  fallbackTotal: number,
  seedTasks?: ParsedTask[],
): DispatchDisplayData {
  const stepsRef = useRef<SubagentStep[]>([]);
  const progressRef = useRef<MultiAgentState | null>(null);
  const statsRef = useRef<Map<string, AgentStatsEvent>>(new Map());
  const dirtyRef = useRef(false);
  const maxStepsRef = useRef(maxSteps);
  maxStepsRef.current = maxSteps;
  const fallbackRef = useRef(fallbackTotal);
  fallbackRef.current = fallbackTotal;

  const [, setTick] = useState(0);

  const seedTasksRef = useRef(seedTasks);
  seedTasksRef.current = seedTasks;

  useEffect(() => {
    if (!parentId) return;
    stepsRef.current = [];
    statsRef.current = new Map();
    dirtyRef.current = false;

    const seeds = seedTasksRef.current;
    if (seeds && seeds.length > 0) {
      const agents = new Map<string, AgentInfo>();
      for (const t of seeds) {
        agents.set(t.agentId, {
          role: t.role ?? "explore",
          task: t.task ?? "",
          state: "pending",
        });
      }
      progressRef.current = { totalAgents: seeds.length, agents, findingCount: 0 };
    } else {
      progressRef.current = null;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleTick = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (dirtyRef.current) {
          dirtyRef.current = false;
          setTick((n) => n + 1);
        }
      }, RENDER_DEBOUNCE);
    };

    const unsub1 = onSubagentStep((step) => {
      if (step.parentToolCallId !== parentId) return;
      const prev = stepsRef.current;
      const existing = prev.findIndex(
        (s) => s.toolName === step.toolName && s.args === step.args && s.state === "running",
      );
      if (existing >= 0 && step.state !== "running") {
        const next = [...prev];
        next[existing] = step;
        stepsRef.current = next;
      } else {
        const next = [...prev, step];
        const max = maxStepsRef.current;
        stepsRef.current = next.length > max ? next.slice(-max) : next;
      }
      dirtyRef.current = true;
      scheduleTick();
    });

    const unsub2 = onMultiAgentEvent((event: MultiAgentEvent) => {
      if (event.parentToolCallId !== parentId) return;
      progressRef.current = applyMultiAgentEvent(progressRef.current, event, fallbackRef.current);
      dirtyRef.current = true;
      scheduleTick();
    });

    const unsub3 = onAgentStats((event) => {
      if (event.parentToolCallId !== parentId) return;
      const next = new Map(statsRef.current);
      next.set(event.agentId, event);
      statsRef.current = next;
      dirtyRef.current = true;
      scheduleTick();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [parentId]);

  if (!parentId) return EMPTY_DISPATCH;
  return {
    steps: stepsRef.current,
    progress: progressRef.current,
    stats: statsRef.current,
  };
}

const ChildStepRow = memo(
  function ChildStepRow({ step }: { step: SubagentStep }) {
    const icon = TOOL_ICONS[step.toolName] ?? "\uF0AD";
    const iconColor = TOOL_ICON_COLORS[step.toolName] ?? "#666";
    const label = TOOL_LABELS[step.toolName] ?? step.toolName;
    const staticCategory = TOOL_CATEGORIES[step.toolName];
    const hasSplit = !!(step.backend && staticCategory && step.backend !== staticCategory);
    const category = hasSplit ? staticCategory : (step.backend ?? staticCategory);
    const backendTag = hasSplit ? step.backend : null;
    const categoryColor =
      (staticCategory ? CATEGORY_COLORS[staticCategory as ToolCategory] : null) ??
      (step.backend ? (CATEGORY_COLORS[step.backend as ToolCategory] ?? "#888") : undefined) ??
      "#888";
    const backendColor = backendTag
      ? (CATEGORY_COLORS[backendTag as ToolCategory] ?? "#888")
      : undefined;
    const isDone = step.state !== "running";

    const cacheIcon = step.cacheState ? (CACHE_ICONS[step.cacheState] ?? "") : "";
    const cacheColor = step.cacheState ? (CACHE_COLORS[step.cacheState] ?? "#888") : "";
    const cacheLabel = getCacheLabel(step);

    return (
      <box height={1} flexShrink={0} marginLeft={3}>
        <text truncate>
          <span fg="#333">├ </span>
          {step.cacheState === "wait" ? (
            <Spinner color={CACHE_COLORS.wait} />
          ) : step.state === "running" ? (
            <Spinner color="#666" />
          ) : step.state === "done" ? (
            <span fg="#4a7">✓</span>
          ) : (
            <span fg="#f44">✗</span>
          )}
          <span fg={isDone ? "#444" : iconColor}> {icon} </span>
          {category ? <span fg={isDone ? "#333" : categoryColor}>[{category}]</span> : null}
          {backendTag ? (
            <span fg={isDone ? "#333" : backendColor}>[{backendLabel(backendTag)}] </span>
          ) : category ? (
            <span> </span>
          ) : null}
          <span fg={isDone ? "#444" : "#888"}>{label}</span>
          {step.agentId ? <span fg={isDone ? "#333" : "#9B30FF"}> [{step.agentId}]</span> : null}
          {step.args ? <span fg={isDone ? "#333" : "#666"}> {step.args}</span> : null}
          {cacheIcon ? (
            <span fg={cacheColor}>
              {" "}
              {cacheIcon} {cacheLabel}
            </span>
          ) : null}
        </text>
      </box>
    );
  },
  (prev, next) =>
    prev.step.toolName === next.step.toolName &&
    prev.step.args === next.step.args &&
    prev.step.state === next.step.state &&
    prev.step.cacheState === next.step.cacheState &&
    prev.step.sourceAgentId === next.step.sourceAgentId &&
    prev.step.backend === next.step.backend &&
    prev.step.agentId === next.step.agentId,
);

interface AgentInfo {
  role: string;
  task: string;
  state: "pending" | "running" | "done" | "error";
  toolUses?: number;
  tokenUsage?: { input: number; output: number; total: number };
  cacheHits?: number;
  modelId?: string;
  tier?: string;
}

interface MultiAgentState {
  totalAgents: number;
  agents: Map<string, AgentInfo>;
  findingCount: number;
}

function humanizeTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function shortModelId(modelId: string): string {
  const parts = modelId.split("/");
  const name = parts[parts.length - 1] ?? modelId;
  if (name.includes("haiku")) return "haiku";
  if (name.includes("sonnet")) return "sonnet";
  if (name.includes("opus")) return "opus";
  if (name.includes("flash")) return "flash";
  if (name.includes("pro")) return "pro";
  if (name.includes("gpt-4o-mini")) return "4o-mini";
  if (name.includes("gpt-4o")) return "4o";
  return name.length > 15 ? `${name.slice(0, 12)}...` : name;
}

function applyMultiAgentEvent(
  prev: MultiAgentState | null,
  event: MultiAgentEvent,
  fallbackTotal: number,
): MultiAgentState {
  const s: MultiAgentState = prev ?? {
    totalAgents: event.totalAgents ?? fallbackTotal,
    agents: new Map(),
    findingCount: 0,
  };
  const total = event.totalAgents ?? s.totalAgents;

  if (event.type === "dispatch-start") {
    return { ...s, totalAgents: event.totalAgents ?? fallbackTotal };
  }
  if (event.type === "agent-start" && event.agentId) {
    const next = new Map(s.agents);
    next.set(event.agentId, {
      role: event.role ?? "explore",
      task: event.task ?? "",
      state: "running",
      modelId: event.modelId,
      tier: event.tier,
    });
    return { ...s, totalAgents: total, agents: next };
  }
  if (event.type === "agent-done" && event.agentId) {
    const next = new Map(s.agents);
    const existing = next.get(event.agentId);
    const stats = {
      toolUses: event.toolUses,
      tokenUsage: event.tokenUsage,
      cacheHits: event.cacheHits,
    };
    if (existing) {
      next.set(event.agentId, { ...existing, state: "done", ...stats });
    } else {
      next.set(event.agentId, {
        role: event.role ?? "explore",
        task: event.task ?? "",
        state: "done",
        ...stats,
      });
    }
    return {
      ...s,
      totalAgents: total,
      agents: next,
      findingCount: event.findingCount ?? s.findingCount,
    };
  }
  if (event.type === "agent-error" && event.agentId) {
    const next = new Map(s.agents);
    const existing = next.get(event.agentId);
    if (existing) {
      next.set(event.agentId, { ...existing, state: "error" });
    } else {
      next.set(event.agentId, {
        role: event.role ?? "explore",
        task: event.task ?? "",
        state: "error",
      });
    }
    return { ...s, totalAgents: total, agents: next };
  }
  return s;
}

const CACHE_ICONS: Record<string, string> = {
  hit: "\uF0E7",
  wait: "\uF017",
  store: "\uF0C7",
  invalidate: "\uF071",
};

const CACHE_COLORS: Record<string, string> = {
  hit: "#4a7",
  wait: "#FFDD57",
  store: "#5af",
  invalidate: "#f80",
};

function getCacheLabel(step: SubagentStep): string {
  switch (step.cacheState) {
    case "hit":
      return step.sourceAgentId ? `from ${step.sourceAgentId}` : "from cache";
    case "wait":
      return step.sourceAgentId ? `waiting on ${step.sourceAgentId}` : "waiting";
    case "store":
      return "cached";
    case "invalidate":
      return "updated cache";
    default:
      return "";
  }
}

const MultiAgentChildRow = memo(
  function MultiAgentChildRow({
    agentId,
    info,
    isLast,
    childSteps,
    liveStats,
  }: {
    agentId: string;
    info: AgentInfo;
    isLast: boolean;
    childSteps: SubagentStep[];
    liveStats?: AgentStatsEvent;
  }) {
    const roleIcon = info.role === "explore" ? "\uDB80\uDE29" : "\uDB80\uDD69";
    const roleColor = info.role === "code" ? "#FF6B2B" : "#9B30FF";
    const isDone = info.state === "done" || info.state === "error";
    const taskStr = info.task.length > 40 ? `${info.task.slice(0, 37)}...` : info.task;
    const connector = isLast && childSteps.length === 0 ? "└ " : "├ ";
    const continuation = isLast ? "  " : "│ ";

    const toolUses = isDone ? info.toolUses : liveStats?.toolUses;
    const tokenUsage = isDone ? info.tokenUsage : liveStats?.tokenUsage;
    const cacheHits = isDone ? info.cacheHits : liveStats?.cacheHits;

    const modelLabel = info.modelId ? shortModelId(info.modelId) : null;
    const tierLabel = info.tier === "trivial" ? "⚡" : info.tier === "desloppify" ? "🧹" : null;

    const statParts: string[] = [];
    if (modelLabel) statParts.push(modelLabel);
    if (toolUses != null && toolUses > 0) statParts.push(`${String(toolUses)} tool uses`);
    if (tokenUsage && tokenUsage.total > 0)
      statParts.push(`${humanizeTokens(tokenUsage.total)} tokens`);
    if (cacheHits && cacheHits > 0) statParts.push(`${humanizeTokens(cacheHits)} cached`);
    const statStr = statParts.length > 0 ? ` · ${statParts.join(" · ")}` : "";

    return (
      <>
        <box height={1} flexShrink={0} marginLeft={3}>
          <text truncate>
            <span fg="#333">{connector}</span>
            {info.state === "running" ? (
              <Spinner color={roleColor} />
            ) : info.state === "done" ? (
              <span fg="#4a7">✓</span>
            ) : info.state === "error" ? (
              <span fg="#f44">✗</span>
            ) : (
              <span fg="#555">○</span>
            )}
            <span fg={isDone ? "#444" : roleColor}> {roleIcon} </span>
            <span
              fg={isDone ? "#444" : "#ddd"}
              attributes={!isDone ? TextAttributes.BOLD : undefined}
            >
              {agentId}
            </span>
            <span fg={isDone ? "#333" : roleColor}>
              {" "}
              ({info.role}){tierLabel ? ` ${tierLabel}` : ""}
            </span>
            <span fg={isDone ? "#333" : "#666"}> {taskStr}</span>
            {statStr ? <span fg={isDone ? "#555" : "#666"}>{statStr}</span> : null}
          </text>
        </box>
        {(() => {
          const MAX_VISIBLE = 6;
          const filtered = childSteps.filter((s) => !QUIET_TOOLS.has(s.toolName));
          const running = filtered.filter((s) => s.state === "running");
          const done = filtered.filter((s) => s.state !== "running");
          const doneSlots = Math.max(0, MAX_VISIBLE - running.length);
          const visibleDone = done.slice(-doneSlots);
          const hiddenCount = done.length - visibleDone.length;
          const visible = [...visibleDone, ...running];
          const agentRunning = info.state === "running";
          const showThinking = agentRunning && running.length === 0 && done.length > 0;

          return (
            <>
              {hiddenCount > 0 && (
                <box height={1} flexShrink={0} marginLeft={3}>
                  <text truncate>
                    <span fg="#333">{continuation} ├ </span>
                    <span fg="#444">+{hiddenCount} completed</span>
                  </text>
                </box>
              )}
              {visible.map((step, i) => {
                const stepIcon = TOOL_ICONS[step.toolName] ?? "\uF0AD";
                const stepColor = TOOL_ICON_COLORS[step.toolName] ?? "#666";
                const stepLabel = TOOL_LABELS[step.toolName] ?? step.toolName;
                const stepStaticCategory = TOOL_CATEGORIES[step.toolName];
                const stepHasSplit = !!(
                  step.backend &&
                  stepStaticCategory &&
                  step.backend !== stepStaticCategory
                );
                const stepCategory = stepHasSplit
                  ? stepStaticCategory
                  : (step.backend ?? stepStaticCategory);
                const stepBackendTag = stepHasSplit ? step.backend : null;
                const stepCatColor =
                  (stepStaticCategory
                    ? CATEGORY_COLORS[stepStaticCategory as ToolCategory]
                    : null) ??
                  (step.backend
                    ? (CATEGORY_COLORS[step.backend as ToolCategory] ?? "#888")
                    : undefined) ??
                  "#888";
                const stepBackendColor = stepBackendTag
                  ? (CATEGORY_COLORS[stepBackendTag as ToolCategory] ?? "#888")
                  : undefined;
                const stepDone = step.state !== "running";
                const stepLast = i === visible.length - 1 && !showThinking;
                const stepConnector = stepLast ? "└ " : "├ ";
                const origIdx = childSteps.indexOf(step);

                const cacheIcon = step.cacheState ? (CACHE_ICONS[step.cacheState] ?? "") : "";
                const cacheColor = step.cacheState ? (CACHE_COLORS[step.cacheState] ?? "#888") : "";
                const cacheLabel = getCacheLabel(step);

                return (
                  <box
                    key={`${step.toolName}-${String(origIdx)}`}
                    height={1}
                    flexShrink={0}
                    marginLeft={3}
                  >
                    <text truncate>
                      <span fg="#333">
                        {continuation}
                        {"  "}
                        {stepConnector}
                      </span>
                      {step.cacheState === "wait" ? (
                        <Spinner color={CACHE_COLORS.wait} />
                      ) : step.state === "running" ? (
                        <Spinner color="#666" />
                      ) : step.state === "done" ? (
                        <span fg="#4a7">✓</span>
                      ) : (
                        <span fg="#f44">✗</span>
                      )}
                      <span fg={stepDone ? "#444" : stepColor}> {stepIcon} </span>
                      {stepCategory ? (
                        <span fg={stepDone ? "#333" : stepCatColor}>[{stepCategory}]</span>
                      ) : null}
                      {stepBackendTag ? (
                        <span fg={stepDone ? "#333" : stepBackendColor}>
                          [{backendLabel(stepBackendTag)}]{" "}
                        </span>
                      ) : stepCategory ? (
                        <span> </span>
                      ) : null}
                      <span fg={stepDone ? "#444" : "#888"}>{stepLabel}</span>
                      {step.args ? <span fg={stepDone ? "#333" : "#666"}> {step.args}</span> : null}
                      {cacheIcon ? (
                        <span fg={cacheColor}>
                          {" "}
                          {cacheIcon} {cacheLabel}
                        </span>
                      ) : null}
                    </text>
                  </box>
                );
              })}
              {showThinking && (
                <box height={1} flexShrink={0} marginLeft={3}>
                  <text truncate>
                    <span fg="#333">
                      {continuation}
                      {"  "}└{" "}
                    </span>
                    <Spinner color="#555" />
                    <span fg="#555"> thinking...</span>
                  </text>
                </box>
              )}
            </>
          );
        })()}
      </>
    );
  },
  (prev, next) =>
    prev.agentId === next.agentId &&
    prev.isLast === next.isLast &&
    prev.info.state === next.info.state &&
    prev.info.role === next.info.role &&
    prev.info.toolUses === next.info.toolUses &&
    prev.info.cacheHits === next.info.cacheHits &&
    prev.info.tokenUsage?.total === next.info.tokenUsage?.total &&
    prev.childSteps.length === next.childSteps.length &&
    prev.childSteps.every((s, i) => {
      const n = next.childSteps[i];
      return (
        n &&
        s.toolName === n.toolName &&
        s.state === n.state &&
        s.args === n.args &&
        s.cacheState === n.cacheState
      );
    }) &&
    prev.liveStats?.toolUses === next.liveStats?.toolUses &&
    prev.liveStats?.tokenUsage?.total === next.liveStats?.tokenUsage?.total &&
    prev.liveStats?.cacheHits === next.liveStats?.cacheHits,
);

const ToolRow = memo(
  function ToolRow({
    tc,
    seconds,
    diffStyle = "default",
  }: {
    tc: LiveToolCall;
    seconds?: number;
    diffStyle?: "default" | "sidebyside" | "compact";
  }) {
    const isSubagent = SUBAGENT_NAMES.has(tc.toolName);
    const multiAgentInfo = useMemo(() => {
      if (tc.toolName !== "dispatch" || !tc.args) return null;
      try {
        const parsed = JSON.parse(tc.args);
        if (Array.isArray(parsed.tasks) && parsed.tasks.length >= 1) {
          const tasks = (
            parsed.tasks as Array<{ agentId?: string; role?: string; task?: string }>
          ).map((t, i) => ({
            agentId: t.agentId ?? `agent-${String(i)}`,
            role: t.role,
            task: t.task,
          }));
          return { totalAgents: parsed.tasks.length as number, tasks };
        }
      } catch {
        // partial JSON during streaming
      }
      return null;
    }, [tc.toolName, tc.args]);
    const isMultiAgent = multiAgentInfo !== null;

    const dispatchId = isSubagent ? tc.id : null;
    const {
      steps: allChildSteps,
      progress: multiProgress,
      stats: liveStats,
    } = useDispatchDisplay(dispatchId, 15, multiAgentInfo?.totalAgents ?? 0, multiAgentInfo?.tasks);

    const isRepoMapHit = useMemo(() => {
      if (!tc.result) return false;
      try {
        const parsed = JSON.parse(tc.result);
        return parsed.repoMapHit === true;
      } catch {
        return false;
      }
    }, [tc.result]);

    const repoMapIcon = TOOL_ICONS._repomap ?? "◈";
    const icon = isRepoMapHit ? repoMapIcon : (TOOL_ICONS[tc.toolName] ?? "\uF0AD");
    const label = isRepoMapHit ? "Repo Map" : (TOOL_LABELS[tc.toolName] ?? tc.toolName);
    const argStr = formatArgs(tc.toolName, tc.args);
    const isDone = tc.state !== "running";

    const editDiff = useMemo(() => {
      if (tc.toolName !== "edit_file" || tc.state !== "done" || !tc.args) return null;
      try {
        const parsed = JSON.parse(tc.args);
        if (
          typeof parsed.path === "string" &&
          typeof parsed.oldString === "string" &&
          typeof parsed.newString === "string"
        ) {
          return {
            path: parsed.path as string,
            oldString: parsed.oldString as string,
            newString: parsed.newString as string,
          };
        }
      } catch {
        // partial or invalid JSON
      }
      return null;
    }, [tc.toolName, tc.state, tc.args]);

    let suffix = "";
    if (isMultiAgent) {
      const total = multiProgress?.totalAgents ?? multiAgentInfo?.totalAgents ?? 0;
      const done = multiProgress
        ? [...multiProgress.agents.values()].filter(
            (a) => a.state === "done" || a.state === "error",
          ).length
        : 0;
      if (tc.state === "running") {
        const agentLabel = total > 0 ? ` · ${String(done)}/${String(total)} agents` : "";
        if (seconds != null && seconds > 0) {
          suffix = ` ${formatDuration(seconds)}${agentLabel}`;
        } else {
          suffix = agentLabel;
        }
        if (multiProgress && multiProgress.findingCount > 0) {
          suffix += ` · ${String(multiProgress.findingCount)} findings`;
        }
      } else if (tc.state === "done") {
        suffix = ` → ${String(done)}/${String(total)} agents`;
      }
    } else if (tc.state === "running" && seconds != null && seconds > 0) {
      suffix = ` ${formatDuration(seconds)}`;
    } else if (tc.state === "done" && tc.result && !editDiff) {
      suffix = ` → ${formatResult(tc.toolName, tc.result)}`;
    } else if (tc.state === "error" && tc.error) {
      suffix = ` → ${tc.error.slice(0, 50)}`;
    }

    const editSuccess = useMemo(() => {
      if (!editDiff || !tc.result) return false;
      try {
        const parsed = JSON.parse(tc.result);
        return parsed.success === true;
      } catch {
        return false;
      }
    }, [editDiff, tc.result]);

    const editError = useMemo(() => {
      if (!editDiff || !tc.result) return undefined;
      try {
        const parsed = JSON.parse(tc.result);
        if (!parsed.success && parsed.error) return parsed.error as string;
      } catch {
        // ignore
      }
      return undefined;
    }, [editDiff, tc.result]);

    const iconColor = isRepoMapHit ? "#2dd4bf" : (TOOL_ICON_COLORS[tc.toolName] ?? "#888");
    const staticCategory = isRepoMapHit
      ? ("repo-map" as ToolCategory)
      : TOOL_CATEGORIES[tc.toolName];
    const backendCategory = useMemo(() => {
      if (isRepoMapHit) return null;
      if (tc.result) {
        try {
          const parsed = JSON.parse(tc.result);
          if (parsed.backend && typeof parsed.backend === "string") {
            return parsed.backend as string;
          }
        } catch {
          // not JSON
        }
      }
      return tc.backend ?? null;
    }, [tc.result, tc.backend, isRepoMapHit]);
    const hasSplit = !!(backendCategory && staticCategory && backendCategory !== staticCategory);
    const category = hasSplit ? staticCategory : (backendCategory ?? staticCategory);
    const backendTag = hasSplit ? backendCategory : null;
    const categoryColor =
      (staticCategory ? CATEGORY_COLORS[staticCategory as ToolCategory] : null) ??
      (backendCategory
        ? (CATEGORY_COLORS[backendCategory as ToolCategory] ?? "#888")
        : undefined) ??
      "#888";
    const backendColor = backendTag
      ? (CATEGORY_COLORS[backendTag as ToolCategory] ?? "#888")
      : undefined;

    return (
      <box flexDirection="column">
        <box height={1} flexShrink={0}>
          <text truncate>
            <StatusIcon state={tc.state} />
            <span fg={isDone ? COLORS.textDone : iconColor}> {icon} </span>
            {category ? <span fg={isDone ? "#444" : categoryColor}>[{category}]</span> : null}
            {backendTag ? (
              <span fg={isDone ? "#444" : backendColor}>[{backendLabel(backendTag)}] </span>
            ) : category ? (
              <span> </span>
            ) : null}
            <span
              fg={isDone ? COLORS.textDone : COLORS.toolNameActive}
              attributes={!isDone ? TextAttributes.BOLD : undefined}
            >
              {label}
            </span>
            {argStr ? (
              <span fg={isDone ? COLORS.textDone : COLORS.argsActive}> {argStr}</span>
            ) : null}
            {suffix ? (
              <span fg={tc.state === "error" ? COLORS.error : COLORS.textDone}>{suffix}</span>
            ) : null}
          </text>
        </box>
        {editDiff ? (
          <box marginLeft={2}>
            <DiffView
              filePath={editDiff.path}
              oldString={editDiff.oldString}
              newString={editDiff.newString}
              success={editSuccess}
              errorMessage={editError}
              mode={diffStyle}
            />
          </box>
        ) : null}
        {isMultiAgent && multiProgress !== null && multiProgress.agents.size > 0 && (
          <box flexDirection="column" marginLeft={2}>
            {[...multiProgress.agents.entries()].map(([agentId, info], idx, arr) => {
              const agentSteps = allChildSteps.filter((s) => s.agentId === agentId);
              return (
                <MultiAgentChildRow
                  key={agentId}
                  agentId={agentId}
                  info={info}
                  isLast={idx === arr.length - 1}
                  childSteps={agentSteps}
                  liveStats={liveStats.get(agentId)}
                />
              );
            })}
          </box>
        )}
        {isSubagent && !isMultiAgent && allChildSteps.length > 0 && (
          <box flexDirection="column">
            {(() => {
              const MAX_SINGLE = 5;
              const filtered = allChildSteps.filter((s) => !QUIET_TOOLS.has(s.toolName));
              const running = filtered.filter((s) => s.state === "running");
              const done = filtered.filter((s) => s.state !== "running");
              const doneSlots = Math.max(0, MAX_SINGLE - running.length);
              const visibleDone = done.slice(-doneSlots);
              const hiddenCount = done.length - visibleDone.length;
              const visible = [...visibleDone, ...running];
              const agentRunning = tc.state === "running";
              const showThinking = agentRunning && running.length === 0 && done.length > 0;

              return (
                <>
                  {hiddenCount > 0 && (
                    <box height={1} flexShrink={0} marginLeft={3}>
                      <text truncate>
                        <span fg="#333">├ </span>
                        <span fg="#444">+{hiddenCount} completed</span>
                      </text>
                    </box>
                  )}
                  {visible.map((step) => {
                    const stableIdx = allChildSteps.indexOf(step);
                    return (
                      <ChildStepRow key={`${step.toolName}-${String(stableIdx)}`} step={step} />
                    );
                  })}
                  {showThinking && (
                    <box height={1} flexShrink={0} marginLeft={3}>
                      <text truncate>
                        <span fg="#333">└ </span>
                        <Spinner color="#555" />
                        <span fg="#555"> thinking...</span>
                      </text>
                    </box>
                  )}
                </>
              );
            })()}
          </box>
        )}
      </box>
    );
  },
  (prev, next) =>
    prev.tc.id === next.tc.id &&
    prev.tc.state === next.tc.state &&
    prev.tc.args === next.tc.args &&
    prev.tc.result === next.tc.result &&
    prev.tc.error === next.tc.error &&
    prev.tc.backend === next.tc.backend &&
    prev.seconds === next.seconds &&
    prev.diffStyle === next.diffStyle,
);

const QUIET_TOOLS = new Set(["update_plan_step", "ask_user", "task_list"]);

interface Props {
  calls: LiveToolCall[];
  verbose?: boolean;
  diffStyle?: "default" | "sidebyside" | "compact";
}

export const ToolCallDisplay = memo(function ToolCallDisplay({
  calls,
  verbose = false,
  diffStyle = "default",
}: Props) {
  const elapsed = useElapsedTimers(calls);

  if (calls.length === 0) return null;

  const visible = calls.filter(
    (tc) => !QUIET_TOOLS.has(tc.toolName) || (verbose && tc.toolName === "ask_user"),
  );

  return (
    <box flexDirection="column">
      {visible.map((tc) => {
        const seconds = elapsed.get(tc.id);
        if ((tc.toolName === "write_plan" || tc.toolName === "plan") && tc.args) {
          try {
            const plan = JSON.parse(tc.args) as PlanOutput;
            if (
              plan.title &&
              Array.isArray(plan.steps) &&
              Array.isArray(plan.files) &&
              Array.isArray(plan.verification)
            ) {
              return <StructuredPlanView key={tc.id} plan={plan} result={tc.result} />;
            }
          } catch {
            // Fall through to normal row
          }
        }
        return <ToolRow key={tc.id} tc={tc} seconds={seconds} diffStyle={diffStyle} />;
      })}
    </box>
  );
});
