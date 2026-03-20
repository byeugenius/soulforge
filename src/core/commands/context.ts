import type { ConfigScope } from "../../components/layout/shared.js";
import type { InfoPopupLine } from "../../components/modals/InfoPopup.js";
import type { TokenUsage } from "../../hooks/useChat.js";
import { useStatusBarStore } from "../../stores/statusbar.js";
import { useUIStore } from "../../stores/ui.js";
import type { ContextManager } from "../context/manager.js";
import { icon } from "../icons.js";
import { getModelContextInfo, getShortModelLabel } from "../llm/models.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { formatBytes, sysMsg } from "./utils.js";

function applyRepoMapToggle(
  ctx: CommandContext,
  nowEnabled: boolean,
  toScope: ConfigScope,
  fromScope?: ConfigScope,
): void {
  const cm = ctx.contextManager;
  cm.setRepoMapEnabled(nowEnabled);
  ctx.saveToScope({ repoMap: nowEnabled }, toScope, fromScope);

  if (nowEnabled) {
    if (!cm.isRepoMapReady()) cm.refreshRepoMap().catch(() => {});
  } else {
    if (cm.isSemanticEnabled()) {
      cm.setSemanticSummaries("off");
      ctx.saveToScope({ semanticSummaries: "off" }, toScope);
    }
    cm.clearRepoMap();
  }

  sysMsg(ctx, `Soul map ${nowEnabled ? "enabled" : "disabled"} (${toScope}).`);
}

function triggerSemanticGeneration(ctx: CommandContext, cm: ContextManager): void {
  const modelId = cm.getSemanticModelId(ctx.chat.activeModel);
  const label = getShortModelLabel(modelId);
  sysMsg(ctx, `Generating semantic summaries [${label}]...`);
  cm.generateSemanticSummaries(modelId)
    .then((count) => {
      sysMsg(
        ctx,
        count > 0
          ? `Generated ${String(count)} semantic summaries [${label}].`
          : `All ${String(cm.getRepoMap().getStats().summaries)} summaries up to date.`,
      );
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sysMsg(ctx, `Failed to generate semantic summaries: ${msg}`);
    });
}

function buildRepoMapOptions(ctx: CommandContext) {
  const cm = ctx.contextManager;
  const repoMap = cm.getRepoMap();
  const enabled = cm.isRepoMapEnabled();
  const ready = cm.isRepoMapReady();
  const mode = cm.getSemanticMode();
  const stats = repoMap.getStats();
  const size = repoMap.dbSizeBytes();

  const statusDesc = enabled
    ? ready
      ? `${String(stats.files)} files, ${String(stats.symbols)} sym, ${String(stats.edges)} edges (${formatBytes(size)})`
      : "scanning..."
    : "off — using file tree";

  return {
    currentValue: enabled ? "enable" : "disable",
    options: [
      {
        value: "enable",
        label: "Enable (recommended)",
        description: `AST-ranked codebase map — ${statusDesc}`,
      },
      { value: "disable", label: "Disable", description: "fall back to static file tree" },
      { value: "refresh", label: "Refresh", description: "rescan all files and rebuild index" },
      {
        value: "clear",
        label: "Clear Index",
        description: `delete index data (${formatBytes(size)})`,
      },
      {
        value: "semantic",
        label: mode === "llm" || mode === "on" ? "LLM Summaries ✓" : "LLM Summaries",
        description:
          !enabled || !ready
            ? "requires soul map to be active"
            : mode === "llm" || mode === "on"
              ? `ON — ${String(stats.summaries)} cached [${getShortModelLabel(cm.getSemanticModelId(ctx.chat.activeModel))}]`
              : "generate AI descriptions for top symbols",
      },
      {
        value: "semantic-ast",
        label: mode === "ast" || mode === "on" ? "AST Docstrings ✓" : "AST Docstrings",
        description:
          !enabled || !ready
            ? "requires soul map to be active"
            : mode === "ast"
              ? `ON — ${String(stats.summaries)} extracted from comments`
              : mode === "on"
                ? "ON — extracts from JSDoc/docstrings where available"
                : "extract summaries from JSDoc/docstrings (free, instant)",
      },
      ...(cm.isSemanticEnabled() && enabled && ready
        ? [
            ...(mode === "llm" || mode === "on"
              ? [
                  {
                    value: "semantic-regen",
                    label: "Regenerate Summaries",
                    description: "clear cache and regenerate all summaries",
                  },
                ]
              : []),
            {
              value: "semantic-clear",
              label: "Clear Summaries",
              description: `delete ${String(stats.summaries)} cached summaries`,
            },
          ]
        : []),
      { value: "info", label: "Status", description: statusDesc },
    ],
  };
}

function refreshRepoMapPicker(ctx: CommandContext): void {
  const { options, currentValue } = buildRepoMapOptions(ctx);
  useUIStore.getState().updatePickerOptions(options, currentValue);
}

export function openRepoMapMenu(ctx: CommandContext): void {
  const { options, currentValue } = buildRepoMapOptions(ctx);

  ctx.openCommandPicker({
    title: "Soul Map",
    icon: icon("repomap"),
    currentValue,
    keepOpen: true,
    scopeEnabled: true,
    initialScope: ctx.detectScope("repoMap"),
    options,
    onSelect: (value, scope) => {
      const cm = ctx.contextManager;
      if (value === "enable" || value === "disable") {
        applyRepoMapToggle(ctx, value === "enable", scope ?? "project");
      } else if (value === "refresh") {
        sysMsg(ctx, "Rebuilding soul map...");
        cm.refreshRepoMap().catch(() => {});
      } else if (value === "clear") {
        if (cm.isSemanticEnabled()) {
          cm.setSemanticSummaries("off");
          ctx.saveToScope({ semanticSummaries: "off" }, scope ?? "project");
        }
        cm.setRepoMapEnabled(false);
        cm.clearRepoMap();
        ctx.saveToScope({ repoMap: false }, scope ?? "project");
        sysMsg(ctx, `Soul map disabled and index cleared (${scope ?? "project"}).`);
      } else if (value === "semantic") {
        if (!cm.isRepoMapEnabled() || !cm.isRepoMapReady()) {
          sysMsg(ctx, "Enable soul map first — semantic summaries depend on the symbol index.");
          return;
        }
        const current = cm.getSemanticMode();
        const llmOn = current === "llm" || current === "on";
        const astOn = current === "ast" || current === "on";
        const next = llmOn ? (astOn ? "ast" : "off") : astOn ? "on" : "llm";
        cm.setSemanticSummaries(next);
        ctx.saveToScope({ semanticSummaries: next }, scope ?? "project");
        if (next === "llm" || next === "on") {
          triggerSemanticGeneration(ctx, cm);
        } else {
          sysMsg(ctx, `LLM summaries disabled (${scope ?? "project"}).`);
        }
      } else if (value === "semantic-ast") {
        if (!cm.isRepoMapEnabled() || !cm.isRepoMapReady()) {
          sysMsg(ctx, "Enable soul map first — semantic summaries depend on the symbol index.");
          return;
        }
        const current = cm.getSemanticMode();
        const astOn = current === "ast" || current === "on";
        const llmOn = current === "llm" || current === "on";
        const next = astOn ? (llmOn ? "llm" : "off") : llmOn ? "on" : "ast";
        cm.setSemanticSummaries(next);
        ctx.saveToScope({ semanticSummaries: next }, scope ?? "project");
        sysMsg(
          ctx,
          next === "ast" || next === "on"
            ? `AST docstring summaries enabled (${scope ?? "project"}).`
            : `AST summaries disabled (${scope ?? "project"}).`,
        );
      } else if (value === "semantic-regen") {
        cm.clearSemanticSummaries();
        sysMsg(ctx, "Cleared cached summaries.");
        triggerSemanticGeneration(ctx, cm);
      } else if (value === "semantic-clear") {
        cm.clearSemanticSummaries();
        const stats = cm.getRepoMap().getStats();
        sysMsg(ctx, `Cleared ${String(stats.summaries)} cached summaries.`);
      } else if (value === "info") {
        useUIStore.getState().openModal("repoMapStatus");
      }
      refreshRepoMapPicker(ctx);
    },
    onScopeMove: (value, from, to) => {
      applyRepoMapToggle(ctx, value === "enable", to, from);
      refreshRepoMapPicker(ctx);
    },
  });
}

export function openMemoryMenu(ctx: CommandContext): void {
  const memMgr = ctx.contextManager.getMemoryManager();

  const showMain = () => {
    const config = memMgr.scopeConfig;
    ctx.openCommandPicker({
      title: "Memory",
      icon: icon("memory"),
      options: [
        {
          value: "write-scope",
          label: "Write Scope",
          description: `where Forge saves new memories (current: ${config.writeScope})`,
        },
        {
          value: "read-scope",
          label: "Read Scope",
          description: `which memories Forge can access (current: ${config.readScope})`,
        },
        {
          value: "settings-storage",
          label: "Save Settings To",
          description: `where these scope preferences are stored (current: ${memMgr.settingsScope})`,
        },
        { value: "view", label: "View Memories", description: "browse all stored memories" },
        { value: "clear", label: "Clear Memories", description: "permanently delete memories" },
      ],
      onSelect: (value) => {
        if (value === "write-scope") {
          ctx.openCommandPicker({
            title: "Write Scope",
            icon: icon("memory"),
            currentValue: memMgr.scopeConfig.writeScope,
            options: [
              {
                value: "global",
                label: "Global",
                description: "shared across all projects (~/.soulforge/)",
              },
              {
                value: "project",
                label: "Project",
                description: "scoped to this project (.soulforge/)",
              },
              { value: "none", label: "None", description: "Forge won't save new memories" },
            ],
            onSelect: (ws) => {
              memMgr.scopeConfig = {
                ...memMgr.scopeConfig,
                writeScope: ws as "global" | "project" | "none",
              };
              sysMsg(ctx, `Memory write scope: ${ws}`);
              showMain();
            },
          });
        } else if (value === "read-scope") {
          ctx.openCommandPicker({
            title: "Read Scope",
            icon: icon("memory"),
            currentValue: memMgr.scopeConfig.readScope,
            options: [
              {
                value: "all",
                label: "All",
                description: "search both project and global memories",
              },
              { value: "global", label: "Global", description: "only access global memories" },
              {
                value: "project",
                label: "Project",
                description: "only access this project's memories",
              },
              {
                value: "none",
                label: "None",
                description: "Forge won't read or auto-recall memories",
              },
            ],
            onSelect: (rs) => {
              memMgr.scopeConfig = {
                ...memMgr.scopeConfig,
                readScope: rs as "global" | "project" | "all" | "none",
              };
              sysMsg(ctx, `Memory read scope: ${rs}`);
              showMain();
            },
          });
        } else if (value === "settings-storage") {
          ctx.openCommandPicker({
            title: "Persist Settings",
            icon: icon("memory"),
            currentValue: memMgr.settingsScope,
            options: [
              {
                value: "project",
                label: "Project",
                description: "scope preferences saved in .soulforge/ (this project only)",
              },
              {
                value: "global",
                label: "Global",
                description: "scope preferences saved in ~/.soulforge/ (apply everywhere)",
              },
            ],
            onSelect: (ss) => {
              memMgr.setSettingsScope(ss as "project" | "global");
              sysMsg(ctx, `Memory settings saved to: ${ss}`);
              showMain();
            },
          });
        } else if (value === "view") {
          const scopes = ["project", "global"] as const;
          const lines: InfoPopupLine[] = [];
          for (const scope of scopes) {
            const memories = memMgr.listByScope(scope);
            lines.push({ type: "header", label: `${scope} (${String(memories.length)})` });
            if (memories.length === 0) {
              lines.push({ type: "text", label: "  (empty)", color: "#444" });
            } else {
              for (const m of memories) {
                lines.push({
                  type: "entry",
                  label: `  ${m.category}`,
                  desc: m.title,
                  color: "#FF8C00",
                });
              }
            }
            lines.push({ type: "spacer" });
          }
          ctx.openInfoPopup({ title: "Memories", icon: icon("memory"), lines, onClose: showMain });
        } else if (value === "clear") {
          ctx.openCommandPicker({
            title: "Clear Memories",
            icon: icon("memory"),
            options: [
              {
                value: "project",
                label: "Project",
                description: "delete all project-scoped memories",
              },
              { value: "global", label: "Global", description: "delete all global memories" },
              { value: "all", label: "All", description: "delete everything from both scopes" },
            ],
            onSelect: (scope) => {
              const cleared = memMgr.clearScope(scope as "project" | "global" | "all");
              sysMsg(ctx, `Cleared ${String(cleared)} ${scope} memories.`);
              showMain();
            },
          });
        }
      },
    });
  };

  showMain();
}

function handleContextClear(input: string, ctx: CommandContext): void {
  const cmd = input.trim().toLowerCase();
  const what = cmd.includes("git")
    ? "git"
    : cmd.includes("skills")
      ? "skills"
      : cmd.includes("memory")
        ? "memory"
        : "all";
  const cleared = ctx.contextManager.clearContext(what as "git" | "memory" | "skills" | "all");
  sysMsg(ctx, cleared.length > 0 ? `Cleared: ${cleared.join(", ")}` : "Nothing to clear.");
}

function handleContext(_input: string, ctx: CommandContext): void {
  const breakdown = ctx.contextManager.getContextBreakdown();
  const totalChars = breakdown.reduce((sum, s) => sum + s.chars, 0);
  const modelId = ctx.chat.activeModel;
  const storeWindow = useStatusBarStore.getState().contextWindow;
  const ctxWindow = storeWindow > 0 ? storeWindow : getModelContextInfo(modelId).tokens;
  const tu: TokenUsage = ctx.chat.tokenUsage;
  const apiCtx = ctx.chat.contextTokens;
  const usedTokens = apiCtx > 0 ? apiCtx : Math.ceil(totalChars / 4);
  const fillPct = Math.min(100, Math.round((usedTokens / ctxWindow) * 100));

  const fmtT = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  };

  const popupLines: InfoPopupLine[] = [
    {
      type: "bar",
      label: "Context window",
      pct: fillPct,
      desc: `${fmtT(usedTokens)} / ${fmtT(ctxWindow)} (${String(fillPct)}%)`,
      descColor: fillPct > 75 ? "#FF0040" : fillPct > 50 ? "#FF8C00" : "#888",
    },
    {
      type: "entry",
      label: "Model",
      desc: getShortModelLabel(modelId),
      color: "#888",
      descColor: "#ccc",
    },
    { type: "separator" },
    { type: "header", label: "System Prompt Breakdown" },
  ];

  const activeSections = breakdown.filter((s) => s.active && s.chars > 0);
  const totalSysChars = activeSections.reduce((sum, s) => sum + s.chars, 0);
  for (const s of activeSections) {
    const sTokens = Math.ceil(s.chars / 4);
    const sPct = totalSysChars > 0 ? Math.round((s.chars / totalSysChars) * 100) : 0;
    popupLines.push({
      type: "bar",
      label: s.section,
      pct: sPct,
      desc: `~${fmtT(sTokens)}`,
      color: "#ccc",
      descColor: "#666",
      barColor: sPct > 40 ? "#FF8C00" : "#555",
    });
  }

  popupLines.push(
    { type: "separator" },
    { type: "header", label: "Token Usage (session)" },
    {
      type: "entry",
      label: "Input",
      desc: fmtT(tu.prompt),
      color: "#2d9bf0",
      descColor: "#2d9bf0",
    },
    {
      type: "entry",
      label: "Output",
      desc: fmtT(tu.completion),
      color: "#e0a020",
      descColor: "#e0a020",
    },
    { type: "entry", label: "Total", desc: fmtT(tu.total), color: "#ccc", descColor: "#ccc" },
  );
  if (tu.subagentInput > 0 || tu.subagentOutput > 0) {
    popupLines.push({
      type: "entry",
      label: "  Dispatch Agents",
      desc: `${fmtT(tu.subagentInput)}↑ ${fmtT(tu.subagentOutput)}↓ (included in total)`,
      color: "#9B30FF",
      descColor: "#666",
    });
  }

  if (tu.cacheRead > 0) {
    const cachePct = tu.prompt > 0 ? Math.round((tu.cacheRead / tu.prompt) * 100) : 0;
    const newTokens = tu.prompt - tu.cacheRead;
    popupLines.push(
      { type: "separator" },
      { type: "header", label: "⚡ Cache Savings" },
      {
        type: "bar",
        label: "Cache hit rate",
        pct: cachePct,
        desc: `${String(cachePct)}%`,
        barColor: "#2d5",
        descColor: "#2d5",
      },
      {
        type: "entry",
        label: "Cached",
        desc: `${fmtT(tu.cacheRead)} tokens (reused from cache)`,
        color: "#2d5",
        descColor: "#2d5",
      },
      {
        type: "entry",
        label: "New input",
        desc: `${fmtT(newTokens)} tokens (fresh processing)`,
        color: "#888",
        descColor: "#888",
      },
    );
  }

  popupLines.push(
    { type: "separator" },
    { type: "text", label: "/context clear [git|skills|memory|all]" },
  );
  ctx.openInfoPopup({
    title: "Context Budget",
    icon: icon("budget"),
    lines: popupLines,
    labelWidth: 22,
    width: 72,
  });
}

function handleMemory(_input: string, ctx: CommandContext): void {
  openMemoryMenu(ctx);
}

function handleRepoMap(_input: string, ctx: CommandContext): void {
  openRepoMapMenu(ctx);
}

export function register(map: Map<string, CommandHandler>): void {
  map.set("/context", handleContext);
  map.set("/memory", handleMemory);
  map.set("/repo-map", handleRepoMap);
}

export function matchContextPrefix(cmd: string): CommandHandler | null {
  if (cmd.startsWith("/context clear") || cmd === "/context reset") return handleContextClear;
  return null;
}
