import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { getGitLog, gitPull, gitPush, gitStash, gitStashPop } from "../../core/git/status.js";
import { icon } from "../../core/icons.js";

import { useTheme } from "../../core/theme/index.js";
import { POPUP_BG, POPUP_HL, Popup, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 54;
const CHROME_ROWS = 7;

interface MenuItem {
  key: string;
  label: string;
  action: string;
}

const MENU_ITEMS: MenuItem[] = [
  { key: "c", label: "Commit", action: "commit" },
  { key: "p", label: "Push", action: "push" },
  { key: "u", label: "Pull", action: "pull" },
  { key: "s", label: "Stash", action: "stash" },
  { key: "o", label: "Stash Pop", action: "stash-pop" },
  { key: "l", label: "Log", action: "log" },
  { key: "g", label: "Lazygit", action: "lazygit" },
];

interface Props {
  visible: boolean;
  cwd: string;
  onClose: () => void;
  onCommit: () => void;
  onSuspend: (opts: { command: string; args?: string[] }) => void;
  onSystemMessage: (msg: string) => void;
  onRefresh: () => void;
}

export function GitMenu({
  visible,
  cwd,
  onClose,
  onCommit,
  onSuspend,
  onSystemMessage,
  onRefresh,
}: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const containerRows = termRows - 2;
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.8));
  const maxVisible = Math.max(4, Math.floor(containerRows * 0.8) - CHROME_ROWS);
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const adjustScroll = (next: number) => {
    setScrollOffset((prev) => {
      if (next < prev) return next;
      if (next >= prev + maxVisible) return next - maxVisible + 1;
      return prev;
    });
  };

  const executeAction = async (action: string) => {
    switch (action) {
      case "commit":
        onClose();
        onCommit();
        return;

      case "push": {
        onClose();
        onSystemMessage("Pushing...");
        const pushResult = await gitPush(cwd);
        onSystemMessage(pushResult.ok ? "Push complete." : `Push failed: ${pushResult.output}`);
        onRefresh();
        return;
      }

      case "pull": {
        onClose();
        onSystemMessage("Pulling...");
        const pullResult = await gitPull(cwd);
        onSystemMessage(pullResult.ok ? "Pull complete." : `Pull failed: ${pullResult.output}`);
        onRefresh();
        return;
      }

      case "stash": {
        onClose();
        const stashResult = await gitStash(cwd);
        onSystemMessage(
          stashResult.ok ? "Changes stashed." : `Stash failed: ${stashResult.output}`,
        );
        onRefresh();
        return;
      }

      case "stash-pop": {
        onClose();
        const popResult = await gitStashPop(cwd);
        onSystemMessage(popResult.ok ? "Stash popped." : `Stash pop failed: ${popResult.output}`);
        onRefresh();
        return;
      }

      case "log": {
        onClose();
        const entries = await getGitLog(cwd, 20);
        if (entries.length === 0) {
          onSystemMessage("No commits found.");
        } else {
          const logText = entries.map((e) => `${e.hash} ${e.subject} (${e.date})`).join("\n");
          onSystemMessage(logText);
        }
        return;
      }

      case "lazygit": {
        onClose();
        try {
          onSuspend({ command: "lazygit" });
        } catch {
          onSystemMessage("Failed to launch lazygit. Is it installed?");
        }
        return;
      }
    }
  };

  useKeyboard((evt) => {
    if (!visible) return;
    if (busy) return;

    if (evt.name === "escape") {
      onClose();
      return;
    }

    if (evt.name === "return") {
      const item = MENU_ITEMS[cursor];
      if (item) {
        setBusy(true);
        executeAction(item.action).finally(() => setBusy(false));
      }
      return;
    }

    if (evt.name === "up" || evt.name === "k") {
      setCursor((prev) => {
        const next = prev > 0 ? prev - 1 : MENU_ITEMS.length - 1;
        adjustScroll(next);
        return next;
      });
      return;
    }

    if (evt.name === "down" || evt.name === "j") {
      setCursor((prev) => {
        const next = prev < MENU_ITEMS.length - 1 ? prev + 1 : 0;
        adjustScroll(next);
        return next;
      });
      return;
    }

    const idx = MENU_ITEMS.findIndex((m) => m.key === evt.name);
    if (idx >= 0) {
      setCursor(idx);
      setBusy(true);
      const item = MENU_ITEMS[idx];
      if (item) {
        executeAction(item.action).finally(() => setBusy(false));
      }
    }
  });

  const t = useTheme();

  if (!visible) return null;

  const innerW = popupWidth - 2;

  return (
    <Popup
      width={popupWidth}
      title="Git"
      icon={icon("git")}
      footer={[
        { key: "↑↓", label: "navigate" },
        { key: "⏎", label: "select" },
        { key: "esc", label: "close" },
      ]}
    >
      <PopupRow w={innerW}>
        <text>{""}</text>
      </PopupRow>

      <box
        flexDirection="column"
        height={Math.min(MENU_ITEMS.length, maxVisible)}
        overflow="hidden"
      >
        {MENU_ITEMS.slice(scrollOffset, scrollOffset + maxVisible).map((item, vi) => {
          const i = vi + scrollOffset;
          const isActive = i === cursor;
          const bg = isActive ? POPUP_HL : POPUP_BG;
          return (
            <PopupRow key={item.action} bg={bg} w={innerW}>
              <text bg={bg} fg={isActive ? t.brandSecondary : t.textMuted}>
                {isActive ? "› " : "  "}
              </text>
              <text
                bg={bg}
                fg={isActive ? t.warning : t.textMuted}
                attributes={isActive ? TextAttributes.BOLD : undefined}
              >
                {item.key}
              </text>
              <text
                bg={bg}
                fg={isActive ? t.brandSecondary : t.textSecondary}
                attributes={isActive ? TextAttributes.BOLD : undefined}
              >
                {"  "}
                {item.label}
              </text>
            </PopupRow>
          );
        })}
      </box>
      {MENU_ITEMS.length > maxVisible && (
        <PopupRow w={innerW}>
          <text fg={t.textMuted} bg={POPUP_BG}>
            {scrollOffset > 0 ? "↑ " : "  "}
            {String(cursor + 1)}/{String(MENU_ITEMS.length)}
            {scrollOffset + maxVisible < MENU_ITEMS.length ? " ↓" : ""}
          </text>
        </PopupRow>
      )}
    </Popup>
  );
}
