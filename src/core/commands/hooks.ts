import { useUIStore } from "../../stores/ui.js";
import { loadHooks } from "../hooks/loader.js";
import { disableHookEvent, enableHookEvent, isHookEventDisabled } from "../hooks/runner.js";
import type { HookEventName, HookRule } from "../hooks/types.js";
import { icon } from "../icons.js";
import { getThemeTokens } from "../theme/index.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { sysMsg } from "./utils.js";

function countHandlers(rules: HookRule[]): number {
  return rules.reduce((n, r) => n + r.hooks.length, 0);
}

function handleHooks(_input: string, ctx: CommandContext): void {
  const hooks = loadHooks(ctx.cwd);
  const t = getThemeTokens();

  const events = Object.entries(hooks) as [HookEventName, HookRule[]][];

  if (events.length === 0) {
    ctx.openInfoPopup({
      title: "Hooks",
      icon: icon("cog"),
      lines: [
        { type: "text", label: "No hooks configured." },
        { type: "spacer" },
        { type: "text", label: "Add hooks to:", color: t.textDim },
        { type: "text", label: "  .claude/settings.json", color: t.textMuted },
        { type: "text", label: "  .soulforge/config.json", color: t.textMuted },
      ],
    });
    return;
  }

  const buildOptions = () =>
    events.map(([event, rules]) => {
      const enabled = !isHookEventDisabled(event);
      const n = countHandlers(rules);
      const matchers = rules
        .map((r) => r.matcher || "*")
        .filter((m, i, a) => a.indexOf(m) === i)
        .join(", ");
      return {
        value: event,
        icon: enabled ? "✓" : " ",
        color: enabled ? t.success : t.textMuted,
        label: `${event} (${String(n)})`,
        description: matchers,
      };
    });

  ctx.openCommandPicker({
    title: "Hooks",
    icon: icon("cog"),
    keepOpen: true,
    currentValue: "",
    options: buildOptions(),
    onSelect: (value) => {
      const event = value as HookEventName;
      if (isHookEventDisabled(event)) {
        enableHookEvent(event);
        sysMsg(ctx, `Hook "${event}" enabled`);
      } else {
        disableHookEvent(event);
        sysMsg(ctx, `Hook "${event}" disabled (session only)`);
      }
      useUIStore.getState().updatePickerOptions(buildOptions());
    },
  });
}

export function register(map: Map<string, CommandHandler>): void {
  map.set("/hooks", handleHooks);
}
