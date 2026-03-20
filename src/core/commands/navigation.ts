import type { CommandPickerOption } from "../../components/modals/CommandPicker.js";
import { useUIStore } from "../../stores/ui.js";
import { icon } from "../icons.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { sysMsg } from "./utils.js";

function handleEditor(_input: string, ctx: CommandContext): void {
  ctx.toggleFocus();
}

function handleHelp(_input: string, ctx: CommandContext): void {
  ctx.openHelp();
}

function handleOpen(input: string, ctx: CommandContext): void {
  const filePath = input.trim().slice(6).trim();
  if (!filePath) {
    sysMsg(ctx, "Usage: /open <file-path>");
    return;
  }
  ctx.openEditorWithFile(filePath);
  sysMsg(ctx, `Opening ${filePath} in editor...`);
}

function handleEditorSettings(_input: string, ctx: CommandContext): void {
  ctx.openEditorSettings();
}

function handleRouter(_input: string, ctx: CommandContext): void {
  ctx.openRouterSettings();
}

function handleProviderSettings(_input: string, ctx: CommandContext): void {
  ctx.openProviderSettings();
}

function handleModels(_input: string, _ctx: CommandContext): void {
  useUIStore.getState().openModal("llmSelector");
}

function handleWebSearch(_input: string, ctx: CommandContext): void {
  ctx.openWebSearchSettings();
}

function handleApiKeys(_input: string, ctx: CommandContext): void {
  ctx.openApiKeySettings();
}

function handleChanges(_input: string, ctx: CommandContext): void {
  ctx.toggleChanges();
}

function handleErrors(_input: string, ctx: CommandContext): void {
  ctx.openErrorLog();
}

function handleCompactionLogs(_input: string, ctx: CommandContext): void {
  ctx.openCompactionLog();
}

function handleSkills(_input: string, ctx: CommandContext): void {
  ctx.openSkills();
}

function handleTabs(_input: string, ctx: CommandContext): void {
  const tabOptions: CommandPickerOption[] = ctx.tabMgr.tabs.map((tab, i) => ({
    value: tab.id,
    label: `${String(i + 1)}. ${tab.label}`,
    icon: tab.id === ctx.tabMgr.activeTabId ? "▸" : " ",
    color: tab.id === ctx.tabMgr.activeTabId ? "#9B30FF" : undefined,
  }));
  ctx.openCommandPicker({
    title: "Switch Tab",
    icon: icon("tabs"),
    options: tabOptions,
    currentValue: ctx.tabMgr.activeTabId,
    onSelect: (tabId) => ctx.tabMgr.switchTab(tabId),
  });
}

function handleNewTab(_input: string, ctx: CommandContext): void {
  ctx.tabMgr.createTab();
}

function handleCloseTab(_input: string, ctx: CommandContext): void {
  if (ctx.tabMgr.tabCount <= 1) {
    sysMsg(ctx, "Can't close the last tab.");
    return;
  }
  if (ctx.tabMgr.isTabLoading(ctx.tabMgr.activeTabId)) {
    const closingId = ctx.tabMgr.activeTabId;
    ctx.openCommandPicker({
      title: "Tab is busy — close anyway?",
      icon: "⚠",
      options: [
        { value: "yes", label: "Yes, close it", icon: "✓" },
        { value: "no", label: "Cancel", icon: "✕" },
      ],
      onSelect: (val) => {
        if (val === "yes") ctx.tabMgr.closeTab(closingId);
      },
    });
  } else {
    ctx.tabMgr.closeTab(ctx.tabMgr.activeTabId);
  }
}

function handleRename(input: string, ctx: CommandContext): void {
  const newName = input.trim().slice(8).trim();
  if (newName) {
    ctx.tabMgr.renameTab(ctx.tabMgr.activeTabId, newName);
    sysMsg(ctx, `Tab renamed to: ${newName}`);
  } else {
    sysMsg(ctx, "Usage: /rename <name>");
  }
}

function handleQuit(_input: string, ctx: CommandContext): void {
  ctx.exit();
}

function handleRestart(_input: string, ctx: CommandContext): void {
  ctx.chat.abort();
  import("../../index.js").then(({ restart }) => restart());
}

export function register(map: Map<string, CommandHandler>): void {
  map.set("/quit", handleQuit);
  map.set("/exit", handleQuit);
  map.set("/restart", handleRestart);
  map.set("/editor", handleEditor);
  map.set("/edit", handleEditor);
  map.set("/help", handleHelp);
  map.set("/editor-settings", handleEditorSettings);
  map.set("/router", handleRouter);
  map.set("/provider-settings", handleProviderSettings);
  map.set("/perf", handleProviderSettings);
  map.set("/providers", handleModels);
  map.set("/provider", handleModels);
  map.set("/models", handleModels);
  map.set("/model", handleModels);
  map.set("/web-search", handleWebSearch);
  map.set("/keys", handleApiKeys);
  map.set("/api-keys", handleApiKeys);
  map.set("/changes", handleChanges);
  map.set("/files", handleChanges);
  map.set("/errors", handleErrors);
  map.set("/compact-v2-logs", handleCompactionLogs);
  map.set("/skills", handleSkills);
  map.set("/tabs", handleTabs);
  map.set("/new-tab", handleNewTab);
  map.set("/close-tab", handleCloseTab);
}

export function matchNavPrefix(cmd: string): CommandHandler | null {
  if (cmd.startsWith("/open ")) return handleOpen;
  if (cmd.startsWith("/rename ")) return handleRename;
  return null;
}
