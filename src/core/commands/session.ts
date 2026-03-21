import { emitCacheReset } from "../tools/file-events.js";
import { clearTasks } from "../tools/task-list.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { sysMsg } from "./utils.js";

async function handleExport(input: string, ctx: CommandContext): Promise<void> {
  const trimmed = input.trim();
  const arg = trimmed.slice(7).trim();

  if (arg === "clipboard" || arg === "clip") {
    const { exportToClipboard } = await import("../sessions/export.js");
    const tabLabel = ctx.tabMgr.activeTab?.label ?? "chat";
    const result = exportToClipboard(ctx.chat.messages, tabLabel);
    sysMsg(ctx, `Copied ${String(result.messageCount)} messages to clipboard (${result.format})`);
    return;
  }

  const format = arg === "json" ? "json" : "markdown";
  const outPath = arg && arg !== "json" && arg !== "md" && arg !== "markdown" ? arg : undefined;
  const { exportChat } = await import("../sessions/export.js");
  const tabLabel = ctx.tabMgr.activeTab?.label ?? "chat";
  const result = exportChat(ctx.chat.messages, { format, outPath, title: tabLabel, cwd: ctx.cwd });
  const relPath = result.path.startsWith(ctx.cwd)
    ? result.path.slice(ctx.cwd.length + 1)
    : result.path;
  sysMsg(ctx, `Exported ${String(result.messageCount)} messages → \`${relPath}\``);
  const { dirname } = await import("node:path");
  const dir = dirname(result.path);
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  Bun.spawn([opener, dir]);
}

function handlePlan(input: string, ctx: CommandContext): void {
  const trimmed = input.trim();
  const arg = trimmed.slice(5).trim();
  if (arg) {
    ctx.chat.setPlanMode(true);
    ctx.chat.setPlanRequest(arg);
    sysMsg(ctx, `Plan mode enabled. Task: ${arg}`);
  } else {
    const newState = !ctx.chat.planMode;
    ctx.chat.setPlanMode(newState);
    if (!newState) ctx.chat.setPlanRequest(null);
    sysMsg(ctx, `Plan mode ${newState ? "enabled" : "disabled"}.`);
  }
}

function handleContinue(_input: string, ctx: CommandContext): void {
  if (ctx.chat.isLoading) {
    sysMsg(ctx, "Generation already in progress.");
  } else {
    ctx.chat.handleSubmit("Continue from where you left off.");
  }
}

function handleClear(_input: string, ctx: CommandContext): void {
  ctx.chat.setMessages([]);
  ctx.chat.setCoreMessages([]);
  ctx.chat.setTokenUsage({
    prompt: 0,
    completion: 0,
    total: 0,
    cacheRead: 0,
    subagentInput: 0,
    subagentOutput: 0,
  });
  ctx.chat.setMessageQueue([]);
  clearTasks();
  emitCacheReset();
  ctx.tabMgr.resetTabLabel(ctx.tabMgr.activeTabId);
}

function handleCompact(_input: string, ctx: CommandContext): void {
  ctx.chat.summarizeConversation();
}

function handleSessions(_input: string, ctx: CommandContext): void {
  ctx.openSessions();
}

export function register(map: Map<string, CommandHandler>): void {
  map.set("/clear", handleClear);
  map.set("/compact", handleCompact);
  map.set("/sessions", handleSessions);
  map.set("/session", handleSessions);
  map.set("/continue", handleContinue);
}

export function matchSessionPrefix(cmd: string): CommandHandler | null {
  if (cmd === "/export" || cmd.startsWith("/export ")) return handleExport;
  if (cmd === "/plan" || cmd.startsWith("/plan ")) return handlePlan;
  return null;
}
