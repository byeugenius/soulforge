import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { icon } from "../../core/icons.js";
import { type SessionListEntry, SessionManager } from "../../core/sessions/manager.js";
import { useTheme } from "../../core/theme/index.js";
import { usePopupScroll } from "../../hooks/usePopupScroll.js";
import { timeAgo } from "../../utils/time.js";
import { POPUP_BG, POPUP_HL, Popup, PopupRow } from "../layout/shared.js";

const POPUP_CHROME = 8;
const COL_MSGS = 7;
const COL_SIZE = 7;
const COL_TIME = 11;
const COL_FIXED = COL_MSGS + COL_SIZE + COL_TIME + 6;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)}K`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)}M`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)}G`;
}

function rpad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

function lpad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
}

interface SessionRowProps {
  session: SessionListEntry;
  isActive: boolean;
  titleColW: number;
  innerW: number;
}

function SessionRow({ session, isActive, titleColW, innerW }: SessionRowProps) {
  const t = useTheme();
  const bg = isActive ? POPUP_HL : POPUP_BG;
  const title =
    session.title.length > titleColW - 2
      ? `${session.title.slice(0, titleColW - 4)}\u2026`
      : session.title;

  return (
    <PopupRow key={session.id} bg={bg} w={innerW}>
      <text bg={bg}>
        <span fg={isActive ? t.brand : t.textFaint}>{isActive ? "\u203A " : "  "}</span>
        <span
          fg={isActive ? t.textPrimary : t.textSecondary}
          attributes={isActive ? TextAttributes.BOLD : 0}
        >
          {rpad(title, titleColW)}
        </span>
        <span fg={isActive ? t.brandAlt : t.textMuted}>
          {lpad(String(session.messageCount), COL_MSGS)}
        </span>
        <span fg={isActive ? t.textMuted : t.textMuted}>
          {lpad(formatSize(session.sizeBytes), COL_SIZE)}
        </span>
        <span fg={isActive ? t.textMuted : t.textDim}>
          {lpad(timeAgo(session.updatedAt), COL_TIME)}
        </span>
      </text>
    </PopupRow>
  );
}

interface Props {
  visible: boolean;
  cwd: string;
  onClose: () => void;
  onRestore: (sessionId: string) => void;
  onSystemMessage: (msg: string) => void;
}

export function SessionPicker({ visible, cwd, onClose, onRestore, onSystemMessage }: Props) {
  const t = useTheme();
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const { width: termCols, height: termRows } = useTerminalDimensions();

  const containerRows = termRows - 2;
  const popupWidth = Math.min(90, Math.floor(termCols * 0.85));
  const maxVisible = Math.max(3, Math.floor(containerRows * 0.8) - POPUP_CHROME);
  const innerW = popupWidth - 2;
  const titleColW = Math.max(15, innerW - COL_FIXED - 4);
  const { cursor, setCursor, scrollOffset, adjustScroll, resetScroll } = usePopupScroll(maxVisible);

  const manager = new SessionManager(cwd);

  const refresh = useCallback(() => {
    setSessions(new SessionManager(cwd).listSessions());
  }, [cwd]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      resetScroll();
      setConfirmClear(false);
      refresh();
    }
  }, [visible, resetScroll, refresh]);

  const filtered = (() => {
    const fq = query.toLowerCase().trim();
    return fq ? sessions.filter((s) => s.title.toLowerCase().includes(fq)) : sessions;
  })();

  const handleKeyboard = (evt: { name?: string; ctrl?: boolean; meta?: boolean }) => {
    if (!visible) return;

    if (confirmClear) {
      if (evt.name === "y") {
        const count = manager.clearAllSessions();
        onSystemMessage(`Cleared ${String(count)} session(s).`);
        setConfirmClear(false);
        refresh();
        resetScroll();
        return;
      }
      setConfirmClear(false);
      return;
    }

    if (evt.name === "escape") {
      onClose();
      return;
    }

    if (evt.name === "up") {
      setCursor((prev: number) => {
        const next = prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1);
        adjustScroll(next);
        return next;
      });
      return;
    }
    if (evt.name === "down") {
      setCursor((prev: number) => {
        const next = prev < filtered.length - 1 ? prev + 1 : 0;
        adjustScroll(next);
        return next;
      });
      return;
    }

    if (evt.name === "return") {
      const session = filtered[cursor];
      if (session) {
        onRestore(session.id);
        onClose();
      }
      return;
    }

    if (evt.name === "backspace" || evt.name === "delete") {
      setQuery((prev) => prev.slice(0, -1));
      resetScroll();
      return;
    }

    if (evt.name === "d" && evt.ctrl) {
      const session = filtered[cursor];
      if (session) {
        manager.deleteSession(session.id);
        onSystemMessage(`Deleted session: ${session.title}`);
        refresh();
        setCursor((prev: number) => Math.min(prev, Math.max(0, filtered.length - 1)));
      }
      return;
    }

    if (evt.name === "x" && evt.ctrl) {
      if (sessions.length > 0) setConfirmClear(true);
      return;
    }

    if (evt.name === "space") {
      setQuery((prev) => `${prev} `);
      resetScroll();
      return;
    }

    if (evt.name && evt.name.length === 1 && !evt.ctrl && !evt.meta) {
      setQuery((prev) => prev + evt.name);
      resetScroll();
    }
  };

  useKeyboard(handleKeyboard);

  if (!visible) return null;

  const totalSize = sessions.reduce((s, x) => s + x.sizeBytes, 0);
  const SEARCH_HL = t.bgPopupHighlight;

  return (
    <Popup
      width={popupWidth}
      title="Sessions"
      icon={icon("clock_alt")}
      headerRight={
        <text fg={t.textMuted} bg={POPUP_BG}>
          {" "}
          {String(sessions.length)} sessions {"\u00B7"} {formatSize(totalSize)}
        </text>
      }
      footer={[
        { key: "\u2191\u2193", label: "navigate" },
        { key: "\u23CE", label: "restore" },
        { key: "^D", label: "delete" },
        { key: "^X", label: "clear all" },
        { key: "esc", label: "close" },
      ]}
    >
      {/* Search */}
      <PopupRow w={innerW} bg={SEARCH_HL}>
        <text fg={t.brand} bg={SEARCH_HL}>
          {"\uD83D\uDD0D"}{" "}
        </text>
        <text fg={t.textPrimary} attributes={TextAttributes.BOLD} bg={SEARCH_HL}>
          {query}
        </text>
        <text fg={t.brandAlt} bg={SEARCH_HL}>
          {"\u258E"}
        </text>
        {!query ? (
          <text fg={t.textDim} bg={SEARCH_HL}>
            {" type to search\u2026"}
          </text>
        ) : (
          <text fg={t.textMuted} bg={SEARCH_HL}>
            {` ${String(filtered.length)} result${filtered.length === 1 ? "" : "s"}`}
          </text>
        )}
      </PopupRow>

      {/* Separator */}
      <PopupRow w={innerW}>
        <text fg={t.textSubtle} bg={POPUP_BG}>
          {"\u2500".repeat(innerW - 4)}
        </text>
      </PopupRow>

      {/* Column headers */}
      <PopupRow w={innerW}>
        <text fg={t.textMuted} bg={POPUP_BG} attributes={TextAttributes.BOLD}>
          {"  "}
          {rpad("Title", titleColW)}
          {lpad("Msgs", COL_MSGS)}
          {lpad("Size", COL_SIZE)}
          {lpad("Updated", COL_TIME)}
        </text>
      </PopupRow>

      {/* Separator */}
      <PopupRow w={innerW}>
        <text fg={t.textSubtle} bg={POPUP_BG}>
          {"\u2500".repeat(innerW - 4)}
        </text>
      </PopupRow>

      {/* List */}
      <box
        flexDirection="column"
        height={Math.min(filtered.length || 1, maxVisible)}
        overflow="hidden"
      >
        {filtered.length === 0 ? (
          <PopupRow w={innerW}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              {"  "}
              {icon("clock_alt")}{" "}
              {query ? "no matching sessions" : "no sessions yet \u2014 start chatting!"}
            </text>
          </PopupRow>
        ) : (
          filtered.slice(scrollOffset, scrollOffset + maxVisible).map((session, vi) => {
            const i = vi + scrollOffset;
            return (
              <SessionRow
                key={session.id}
                session={session}
                isActive={i === cursor}
                titleColW={titleColW}
                innerW={innerW}
              />
            );
          })
        )}
      </box>

      {/* Scroll */}
      {filtered.length > maxVisible && (
        <PopupRow w={innerW}>
          <text fg={t.textMuted} bg={POPUP_BG}>
            {scrollOffset > 0 ? "\u2191 " : "  "}
            {String(cursor + 1)}/{String(filtered.length)}
            {scrollOffset + maxVisible < filtered.length ? " \u2193" : ""}
          </text>
        </PopupRow>
      )}

      {/* Confirm clear */}
      {confirmClear && (
        <PopupRow w={innerW} bg={t.error}>
          <text fg="#fff" attributes={TextAttributes.BOLD} bg={t.error}>
            Delete all {String(sessions.length)} sessions? (y/n)
          </text>
        </PopupRow>
      )}
    </Popup>
  );
}
