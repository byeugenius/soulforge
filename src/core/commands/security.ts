import type { InfoPopupLine } from "../../components/modals/InfoPopup.js";
import { icon } from "../icons.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { sysMsg } from "./utils.js";

async function handlePrivacy(input: string, ctx: CommandContext): Promise<void> {
  const { getAllPatterns, addProjectPattern, removeProjectPattern, addSessionPattern } =
    await import("../security/forbidden.js");
  const trimmed = input.trim();
  const arg = trimmed.slice(9).trim();

  if (arg.startsWith("add ")) {
    const pattern = arg.slice(4).trim();
    if (!pattern) {
      sysMsg(ctx, "Usage: /privacy add <pattern>");
    } else {
      addProjectPattern(ctx.cwd, pattern);
      sysMsg(ctx, `Added forbidden pattern: ${pattern} (saved to .soulforge/forbidden.json)`);
    }
  } else if (arg.startsWith("remove ")) {
    const pattern = arg.slice(7).trim();
    removeProjectPattern(ctx.cwd, pattern);
    sysMsg(ctx, `Removed pattern: ${pattern}`);
  } else if (arg.startsWith("session ")) {
    const pattern = arg.slice(8).trim();
    if (pattern) {
      addSessionPattern(pattern);
      sysMsg(ctx, `Added session pattern: ${pattern} (lost on restart)`);
    }
  } else {
    const patterns = getAllPatterns();
    const popupLines: InfoPopupLine[] = [];

    const addCategory = (name: string, items: string[], max?: number) => {
      popupLines.push({ type: "header", label: `${name} (${String(items.length)})` });
      const show = max ? items.slice(0, max) : items;
      for (const p of show) popupLines.push({ type: "text", label: `  ${p}` });
      if (max && items.length > max) {
        popupLines.push({
          type: "text",
          label: `  ... and ${String(items.length - max)} more`,
          color: "#444",
        });
      }
      popupLines.push({ type: "spacer" });
    };

    addCategory("Built-in", patterns.builtin, 8);
    if (patterns.aiignore.length > 0) addCategory(".aiignore", patterns.aiignore);
    if (patterns.global.length > 0) addCategory("Global", patterns.global);
    if (patterns.project.length > 0) addCategory("Project", patterns.project);
    if (patterns.session.length > 0) addCategory("Session", patterns.session);

    popupLines.push(
      { type: "separator" },
      { type: "spacer" },
      { type: "header", label: "Commands" },
      { type: "entry", label: "/privacy add <pat>", desc: "add to project config" },
      { type: "entry", label: "/privacy remove <pat>", desc: "remove from project config" },
      { type: "entry", label: "/privacy session <pat>", desc: "add for this session only" },
    );
    ctx.openInfoPopup({ title: "Forbidden Patterns", icon: icon("ban"), lines: popupLines });
  }
}

export function register(_map: Map<string, CommandHandler>): void {
  // privacy is prefix-matched, not exact-matched
}

export function matchSecurityPrefix(cmd: string): CommandHandler | null {
  if (cmd === "/privacy" || cmd.startsWith("/privacy ")) return handlePrivacy;
  return null;
}
