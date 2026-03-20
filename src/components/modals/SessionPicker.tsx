import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type SessionListEntry, SessionManager } from "../../core/sessions/manager.js";
import { usePopupScroll } from "../../hooks/usePopupScroll.js";
import { timeAgo } from "../../utils/time.js";
import { Overlay, POPUP_BG, POPUP_HL, PopupRow } from "../layout/shared.js";

const POPUP_CHROME = 7;

interface Props {
  visible: boolean;
  cwd: string;
  onClose: () => void;
  onRestore: (sessionId: string) => void;
  onSystemMessage: (msg: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)}K`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)}M`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)}G`;
}

export function SessionPicker({ visible, cwd, onClose, onRestore, onSystemMessage }: Props) {
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const { width: termCols, height: termRows } = useTerminalDimensions();

  const containerRows = termRows - 2;
  const popupWidth = Math.min(80, Math.floor(termCols * 0.7));
  const maxVisible = Math.max(3, Math.floor(containerRows * 0.7) - POPUP_CHROME);
  const innerW = popupWidth - 2;
  const maxTitleLen = Math.max(15, innerW - 28);
  const { cursor, setCursor, scrollOffset, adjustScroll, resetScroll } = usePopupScroll(maxVisible);

  const manager = useMemo(() => new SessionManager(cwd), [cwd]);

  const refresh = useCallback(() => {
    setSessions(manager.listSessions());
  }, [manager]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      resetScroll();
      setConfirmClear(false);
      refresh();
    }
  }, [visible, refresh, resetScroll]);

  const filterQuery = query.toLowerCase().trim();
  const filtered = filterQuery
    ? sessions.filter((s) => s.title.toLowerCase().includes(filterQuery))
    : sessions;

  useKeyboard((evt) => {
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
      setCursor((prev) => {
        const next = prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1);
        adjustScroll(next);
        return next;
      });
      return;
    }
    if (evt.name === "down") {
      setCursor((prev) => {
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
        setCursor((prev) => Math.min(prev, Math.max(0, filtered.length - 2)));
      }
      return;
    }

    if (evt.name === "x" && evt.ctrl) {
      if (sessions.length > 0) {
        setConfirmClear(true);
      }
      return;
    }

    if (evt.name && evt.name.length === 1 && !evt.ctrl && !evt.meta) {
      setQuery((prev) => prev + evt.name);
      resetScroll();
    }
  });

  if (!visible) return null;

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor="#8B5CF6"
        width={popupWidth}
      >
        <PopupRow w={innerW}>
          <text fg="white" attributes={TextAttributes.BOLD} bg={POPUP_BG}>
            {"\uF017"} Sessions
          </text>
          <text fg="#555" bg={POPUP_BG}>
            {" "}
            ({String(sessions.length)}) {formatSize(sessions.reduce((s, x) => s + x.sizeBytes, 0))}
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text fg="#9B30FF" bg={POPUP_BG}>
            {" "}
          </text>
          {query ? (
            <>
              <text fg="white" bg={POPUP_BG}>
                {query}
              </text>
              <text fg="#FF0040" bg={POPUP_BG}>
                {"\u2588"}
              </text>
            </>
          ) : (
            <>
              <text fg="#FF0040" bg={POPUP_BG}>
                {"\u2588"}
              </text>
              <text fg="#555" bg={POPUP_BG}>
                type to search sessions...
              </text>
            </>
          )}
        </PopupRow>

        <PopupRow w={innerW}>
          <text fg="#333" bg={POPUP_BG}>
            {"\u2500".repeat(innerW - 4)}
          </text>
        </PopupRow>

        <box
          flexDirection="column"
          height={Math.min(filtered.length, maxVisible)}
          overflow="hidden"
        >
          {filtered.length === 0 ? (
            <PopupRow w={innerW}>
              <text fg="#555" bg={POPUP_BG}>
                {query ? "no matching sessions" : "no sessions yet"}
              </text>
            </PopupRow>
          ) : (
            filtered.slice(scrollOffset, scrollOffset + maxVisible).map((session, vi) => {
              const i = vi + scrollOffset;
              const isActive = i === cursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const title =
                session.title.length > maxTitleLen
                  ? `${session.title.slice(0, maxTitleLen - 3)}...`
                  : session.title;
              return (
                <PopupRow key={session.id} bg={bg} w={innerW}>
                  <text bg={bg} fg={isActive ? "#FF0040" : "#555"}>
                    {isActive ? "\u203A " : "  "}
                  </text>
                  <text
                    bg={bg}
                    fg={isActive ? "#FF0040" : "#aaa"}
                    attributes={isActive ? TextAttributes.BOLD : undefined}
                  >
                    {title}
                  </text>
                  <text bg={bg} fg="#555">
                    {"  "}
                    {String(session.messageCount)} msgs
                  </text>
                  <text bg={bg} fg="#444">
                    {"  "}
                    {formatSize(session.sizeBytes)}
                  </text>
                  <text bg={bg} fg="#444">
                    {"  "}
                    {timeAgo(session.updatedAt)}
                  </text>
                </PopupRow>
              );
            })
          )}
        </box>
        {filtered.length > maxVisible && (
          <PopupRow w={innerW}>
            <text fg="#555" bg={POPUP_BG}>
              {scrollOffset > 0 ? "↑ " : "  "}
              {String(cursor + 1)}/{String(filtered.length)}
              {scrollOffset + maxVisible < filtered.length ? " ↓" : ""}
            </text>
          </PopupRow>
        )}

        {confirmClear && (
          <PopupRow w={innerW}>
            <text fg="#FF0040" attributes={TextAttributes.BOLD} bg={POPUP_BG}>
              Delete all {String(sessions.length)} sessions? (y/n)
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text fg="#555" bg={POPUP_BG}>
            {"↑↓"} nav | {"⏎"} restore | ^D delete | ^X clear all | esc close
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
