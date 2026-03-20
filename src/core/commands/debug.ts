import type { InfoPopupLine } from "../../components/modals/InfoPopup.js";
import { useRepoMapStore } from "../../stores/repomap.js";
import { useStatusBarStore } from "../../stores/statusbar.js";
import { icon } from "../icons.js";
import { getIntelligenceStatus, runIntelligenceHealthCheck } from "../intelligence/index.js";
import { getModelContextInfo, getShortModelLabel } from "../llm/models.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { sysMsg } from "./utils.js";

function handleStatus(_input: string, ctx: CommandContext): void {
  const sb = useStatusBarStore.getState();
  const rm = useRepoMapStore.getState();
  const modelInfo = getModelContextInfo(ctx.chat.activeModel);
  const lspStatus = getIntelligenceStatus();
  const lspCount = lspStatus?.lspServers.length ?? 0;
  const rssMB = sb.rssMB;
  const memColor = rssMB < 2048 ? "#4a7" : rssMB < 4096 ? "#b87333" : "#f44";
  const fmtMem = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${String(mb)} MB`);
  const fmtTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  };
  const fmtBytes = (b: number) => {
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${String(b)} B`;
  };
  const ctxPct =
    modelInfo.tokens > 0
      ? Math.round(
          ((sb.contextTokens || (sb.chatChars + sb.subagentChars) / 4) / modelInfo.tokens) * 100,
        )
      : 0;
  const ctxColor =
    ctxPct < 50 ? "#4a7" : ctxPct < 70 ? "#b87333" : ctxPct < 85 ? "#FF8C00" : "#f44";

  const lines: InfoPopupLine[] = [
    { type: "header", label: "Context" },
    {
      type: "bar",
      label: "Usage",
      pct: ctxPct,
      barColor: ctxColor,
      desc: `${String(ctxPct)}%`,
      descColor: ctxColor,
    },
    { type: "entry", label: "Window", desc: fmtTokens(modelInfo.tokens), descColor: "#888" },
    {
      type: "entry",
      label: "Compaction",
      desc: sb.compacting ? "active" : sb.compactionStrategy,
      descColor: sb.compacting ? "#5af" : "#666",
    },
    { type: "spacer" },
    { type: "header", label: "Tokens (session)" },
    { type: "entry", label: "Input", desc: fmtTokens(sb.tokenUsage.prompt), descColor: "#2d9bf0" },
    {
      type: "entry",
      label: "Output",
      desc: fmtTokens(sb.tokenUsage.completion),
      descColor: "#e0a020",
    },
    {
      type: "entry",
      label: "Cache read",
      desc: fmtTokens(sb.tokenUsage.cacheRead),
      descColor: sb.tokenUsage.cacheRead > 0 ? "#4a7" : "#666",
    },
  ];
  const subTotal = sb.tokenUsage.subagentInput + sb.tokenUsage.subagentOutput;
  if (subTotal > 0) {
    lines.push({
      type: "entry",
      label: "Subagents",
      desc: fmtTokens(subTotal),
      descColor: "#9B30FF",
    });
  }
  lines.push(
    { type: "spacer" },
    { type: "header", label: "Soul Map" },
    {
      type: "entry",
      label: "Status",
      desc: rm.status,
      descColor:
        rm.status === "ready"
          ? "#4a7"
          : rm.status === "scanning"
            ? "#b87333"
            : rm.status === "error"
              ? "#f44"
              : "#666",
    },
    { type: "entry", label: "Files", desc: String(rm.files), descColor: "#888" },
    { type: "entry", label: "Symbols", desc: String(rm.symbols), descColor: "#888" },
    { type: "entry", label: "Edges", desc: String(rm.edges), descColor: "#888" },
    { type: "entry", label: "DB size", desc: fmtBytes(rm.dbSizeBytes), descColor: "#888" },
  );
  if (rm.semanticStatus !== "off") {
    lines.push({
      type: "entry",
      label: "Semantics",
      desc: `${rm.semanticStatus} (${String(rm.semanticCount)})`,
      descColor: rm.semanticStatus === "ready" ? "#4a7" : "#b87333",
    });
  }
  lines.push(
    { type: "spacer" },
    { type: "header", label: "System" },
    { type: "entry", label: "Memory", desc: fmtMem(rssMB), descColor: memColor },
    {
      type: "entry",
      label: "LSP servers",
      desc: lspCount > 0 ? `${String(lspCount)} active` : "none",
      descColor: lspCount > 0 ? "#4a7" : "#666",
    },
    {
      type: "entry",
      label: "Model",
      desc: getShortModelLabel(ctx.chat.activeModel),
      descColor: "#888",
    },
    {
      type: "entry",
      label: "Mode",
      desc: ctx.currentModeLabel,
      descColor: ctx.currentMode === "default" ? "#666" : "#FF8C00",
    },
  );
  ctx.openInfoPopup({
    title: "System Status",
    icon: icon("info"),
    lines,
    width: 52,
    labelWidth: 16,
  });
}

async function handleDiagnose(_input: string, ctx: CommandContext): Promise<void> {
  sysMsg(ctx, "Running intelligence health check...");
  const healthResult = await runIntelligenceHealthCheck();
  if (!healthResult) {
    sysMsg(ctx, "Intelligence router not initialized yet");
    return;
  }

  const lines: InfoPopupLine[] = [
    { type: "entry", label: "Language", desc: healthResult.language, descColor: "#8B5CF6" },
    {
      type: "entry",
      label: "Probe file",
      desc: healthResult.probeFile.split("/").pop() ?? healthResult.probeFile,
      descColor: "#666",
    },
    { type: "spacer" },
  ];

  for (const br of healthResult.backends) {
    const statusIcon = !br.supports
      ? "○"
      : br.initError
        ? "✗"
        : br.probes.some((p) => p.status === "pass")
          ? "●"
          : "◐";
    const statusColor = !br.supports
      ? "#555"
      : br.initError
        ? "#FF0040"
        : br.probes.some((p) => p.status === "pass")
          ? "#2d5"
          : "#FF8C00";

    lines.push({
      type: "header",
      label: `${statusIcon} ${br.backend} (tier ${String(br.tier)})`,
      color: statusColor,
    });

    if (!br.supports) {
      lines.push({
        type: "entry",
        label: "",
        desc: "does not support this language",
        descColor: "#555",
      });
    } else if (br.initError) {
      lines.push({
        type: "entry",
        label: "init",
        desc: `✗ ${br.initError.slice(0, 50)}`,
        descColor: "#FF0040",
      });
    } else {
      for (const probe of br.probes) {
        const probeIcon =
          probe.status === "pass"
            ? "✓"
            : probe.status === "empty"
              ? "○"
              : probe.status === "unsupported"
                ? "—"
                : probe.status === "timeout"
                  ? "⏱"
                  : "✗";
        const probeColor =
          probe.status === "pass"
            ? "#2d5"
            : probe.status === "empty"
              ? "#FF8C00"
              : probe.status === "unsupported"
                ? "#555"
                : "#FF0040";
        const timing = probe.ms !== undefined ? `${String(probe.ms)}ms` : "";
        const desc =
          probe.status === "error"
            ? `${probeIcon} ${(probe.error ?? "").slice(0, 40)}`
            : `${probeIcon} ${probe.status} ${timing}`;
        lines.push({ type: "entry", label: probe.operation, desc, descColor: probeColor });
      }
    }
    lines.push({ type: "spacer" });
  }

  ctx.openInfoPopup({
    title: "Intelligence Health Check",
    icon: icon("brain"),
    lines,
    width: 72,
    labelWidth: 30,
  });
}

function handleSetup(_input: string, ctx: CommandContext): void {
  ctx.openSetup();
}

function handleLsp(_input: string, ctx: CommandContext): void {
  ctx.openLspStatus();
}

function handleLspInstall(_input: string, ctx: CommandContext): void {
  ctx.openLspInstall();
}

export function register(map: Map<string, CommandHandler>): void {
  map.set("/status", handleStatus);
  map.set("/diagnose", handleDiagnose);
  map.set("/setup", handleSetup);
  map.set("/lsp", handleLsp);
  map.set("/lsp-install", handleLspInstall);
}
