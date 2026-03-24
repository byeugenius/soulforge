import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fuzzyMatch } from "../../core/history/fuzzy.js";
import { icon, providerIcon } from "../../core/icons.js";
import { PROVIDER_CONFIGS } from "../../core/llm/models.js";
import { useAllProviderModels } from "../../hooks/useAllProviderModels.js";
import { Overlay, POPUP_BG, POPUP_HL, PopupRow, SPINNER_FRAMES } from "../layout/shared.js";

const MAX_W = 72;

type Entry =
  | {
      kind: "header";
      id: string;
      name: string;
      avail: boolean;
      loading: boolean;
      count: number;
    }
  | {
      kind: "model";
      providerId: string;
      id: string;
      fullId: string;
      name: string;
      ctx?: number;
      hasDesc: boolean;
    };

function fmtCtx(n?: number): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${String(Math.round(n / 1_000_000))}M`;
  return `${String(Math.round(n / 1_000))}k`;
}

interface Props {
  visible: boolean;
  activeModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

export const LlmSelector = memo(function LlmSelector({
  visible,
  activeModel,
  onSelect,
  onClose,
}: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const pw = Math.min(MAX_W, Math.floor(termCols * 0.85));
  const iw = pw - 2;
  // Chrome: title(1) + sep(1) + search(1) + sep(1) + spacer(1) + sep(1) + footer(1) = 7
  const maxVis = Math.max(6, termRows - 4 - 7);

  const { providerData: provData, availability, anyLoading } = useAllProviderModels(visible);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [scrollOff, setScrollOff] = useState(0);
  const [spinFrame, setSpinFrame] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setCursor(0);
    setScrollOff(0);
  }, [visible]);

  useEffect(() => {
    if (!anyLoading || !visible) return;
    const timer = setInterval(() => {
      setSpinFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 120);
    return () => clearInterval(timer);
  }, [anyLoading, visible]);

  // Parse "provider/model" scoped search
  const { providerFilter, modelFilter } = useMemo(() => {
    const raw = query.toLowerCase().trim();
    const slashIdx = raw.indexOf("/");
    if (slashIdx >= 0) {
      return { providerFilter: raw.slice(0, slashIdx), modelFilter: raw.slice(slashIdx + 1) };
    }
    return { providerFilter: "", modelFilter: raw };
  }, [query]);

  // Build flat entry list
  const entries = useMemo(() => {
    const out: Entry[] = [];

    for (const cfg of PROVIDER_CONFIGS) {
      const pd = provData[cfg.id];
      const items = pd?.items ?? [];
      const loading = pd?.loading ?? true;
      const avail = availability.get(cfg.id) ?? false;

      if (providerFilter) {
        const provTarget = `${cfg.id} ${cfg.name}`.toLowerCase();
        const provMatch =
          provTarget.includes(providerFilter) || fuzzyMatch(providerFilter, provTarget) !== null;
        if (!provMatch) continue;
      }

      const provTarget = `${cfg.id} ${cfg.name}`.toLowerCase();
      const queryMatchesProvider =
        !providerFilter &&
        modelFilter &&
        (provTarget.includes(modelFilter) || fuzzyMatch(modelFilter, provTarget) !== null);

      let filtered = items;
      if (modelFilter && !queryMatchesProvider) {
        filtered = items.filter((m) => {
          const t = `${m.id} ${m.name ?? ""} ${cfg.id} ${cfg.name}`.toLowerCase();
          return t.includes(modelFilter) || fuzzyMatch(modelFilter, t) !== null;
        });
        if (filtered.length === 0 && !loading) continue;
      }

      if (!avail && items.length === 0 && !loading) continue;

      out.push({
        kind: "header",
        id: cfg.id,
        name: cfg.name,
        avail,
        loading,
        count: filtered.length,
      });

      for (const m of filtered) {
        const name = m.name || m.id;
        const hasDesc = name !== m.id;
        out.push({
          kind: "model",
          providerId: cfg.id,
          id: m.id,
          fullId: `${cfg.id}/${m.id}`,
          name,
          ctx: m.contextWindow,
          hasDesc,
        });
      }
    }
    return out;
  }, [provData, providerFilter, modelFilter, availability]);

  const eH = useCallback((e: Entry): number => (e.kind === "model" && e.hasDesc ? 2 : 1), []);

  // Visual row count (models with descriptions take 2 rows)
  const visualRowCount = useMemo(() => {
    let count = 0;
    for (const e of entries) count += eH(e);
    return count;
  }, [entries, eH]);

  // Reset cursor when entries change
  const prevEntries = useRef(entries);
  useEffect(() => {
    if (entries !== prevEntries.current) {
      prevEntries.current = entries;
      const first = entries.findIndex((e) => e.kind === "model");
      if (first >= 0) {
        setCursor(first);
        setScrollOff(
          Math.max(0, first > 0 && entries[first - 1]?.kind === "header" ? first - 1 : 0),
        );
      } else {
        setCursor(0);
        setScrollOff(0);
      }
    }
  }, [entries]);

  // Refs for keyboard handler
  const scrollRef = useRef(scrollOff);
  scrollRef.current = scrollOff;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const ensureVisible = (idx: number) => {
    const ents = entriesRef.current;
    let top = idx;
    if (idx > 0 && ents[idx - 1]?.kind === "header") top = idx - 1;
    const so = scrollRef.current;
    if (top < so) {
      setScrollOff(top);
      scrollRef.current = top;
    } else {
      let rowsNeeded = 0;
      for (let i = so; i <= idx && i < ents.length; i++) {
        const e = ents[i];
        if (e) rowsNeeded += eH(e);
      }
      if (rowsNeeded > maxVis) {
        let newOff = so;
        while (newOff < idx) {
          const e = ents[newOff];
          if (e) rowsNeeded -= eH(e);
          newOff++;
          if (rowsNeeded <= maxVis) break;
        }
        setScrollOff(newOff);
        scrollRef.current = newOff;
      }
    }
  };

  useKeyboard((evt) => {
    if (!visible) return;
    const ents = entriesRef.current;

    if (evt.name === "escape") {
      if (query) {
        setQuery("");
        return;
      }
      onClose();
      return;
    }

    if (evt.name === "return") {
      const e = ents[cursorRef.current];
      if (e?.kind === "model") {
        onSelect(e.fullId);
        onClose();
      }
      return;
    }

    const move = (dir: 1 | -1) => {
      if (ents.length === 0) return;
      let next = cursorRef.current + dir;
      if (next < 0) next = ents.length - 1;
      if (next >= ents.length) next = 0;
      const start = next;
      while (ents[next]?.kind !== "model") {
        next += dir;
        if (next < 0) next = ents.length - 1;
        if (next >= ents.length) next = 0;
        if (next === start) return;
      }
      setCursor(next);
      cursorRef.current = next;
      ensureVisible(next);
    };

    if (evt.name === "up") {
      move(-1);
      return;
    }
    if (evt.name === "down") {
      move(1);
      return;
    }

    if (evt.name === "tab") {
      let i = cursorRef.current + 1;
      while (i < ents.length && ents[i]?.kind !== "header") i++;
      if (i < ents.length) i++;
      while (i < ents.length && ents[i]?.kind !== "model") i++;
      if (i >= ents.length) {
        i = ents.findIndex((e) => e.kind === "model");
        if (i < 0) return;
      }
      setCursor(i);
      cursorRef.current = i;
      ensureVisible(i);
      return;
    }

    if (evt.name === "backspace" || evt.name === "delete") {
      setQuery((q) => q.slice(0, -1));
      return;
    }

    if (evt.name && evt.name.length === 1 && !evt.ctrl && !evt.meta) {
      setQuery((q) => q + evt.name);
    }
  });

  if (!visible) return null;

  // Build visible slice accounting for variable-height entries
  const visEntries: Entry[] = [];
  let visRows = 0;
  for (let i = scrollOff; i < entries.length && visRows < maxVis; i++) {
    const e = entries[i];
    if (!e) break;
    const h = eH(e);
    if (visRows + h > maxVis && visRows > 0) break;
    visEntries.push(e);
    visRows += h;
  }

  const totalModels = entries.filter((e) => e.kind === "model").length;
  const cursorModelIdx = entries.slice(0, cursor + 1).filter((e) => e.kind === "model").length;
  const canScrollUp = scrollOff > 0;
  const canScrollDown = scrollOff + visEntries.length < entries.length;

  return (
    <Overlay>
      <box flexDirection="column" borderStyle="rounded" border borderColor="#8B5CF6" width={pw}>
        {/* Title — match CommandPicker style */}
        <PopupRow w={iw}>
          <text fg="#9B30FF" bg={POPUP_BG}>
            {icon("model")}{" "}
          </text>
          <text fg="white" attributes={TextAttributes.BOLD} bg={POPUP_BG}>
            Select Model
          </text>
        </PopupRow>

        <PopupRow w={iw}>
          <text fg="#333" bg={POPUP_BG}>
            {"─".repeat(iw - 4)}
          </text>
        </PopupRow>

        {/* Search */}
        <PopupRow w={iw}>
          <text fg="#555" bg={POPUP_BG}>
            {icon("search")}{" "}
          </text>
          <text fg="white" bg={POPUP_BG}>
            {query}
          </text>
          <text fg="#8B5CF6" bg={POPUP_BG}>
            ▎
          </text>
          {!query && (
            <text fg="#333" bg={POPUP_BG}>
              {" search… (provider/model to scope)"}
            </text>
          )}
        </PopupRow>

        <PopupRow w={iw}>
          <text fg="#222" bg={POPUP_BG}>
            {"─".repeat(iw - 4)}
          </text>
        </PopupRow>

        {/* Spacer */}
        <PopupRow w={iw}>
          <text>{""}</text>
        </PopupRow>

        {/* List */}
        {entries.length === 0 ? (
          <PopupRow w={iw}>
            <text fg="#555" bg={POPUP_BG}>
              {query ? "no matching models" : "no providers available"}
            </text>
          </PopupRow>
        ) : (
          <box flexDirection="column" height={Math.min(visualRowCount, maxVis)} overflow="hidden">
            {visEntries.map((entry) => {
              if (entry.kind === "header") {
                return (
                  <PopupRow key={`h-${entry.id}`} w={iw}>
                    <text
                      fg={entry.avail ? "#8B5CF6" : "#333"}
                      attributes={TextAttributes.BOLD}
                      bg={POPUP_BG}
                    >
                      {providerIcon(entry.id)} {entry.name.toUpperCase()}
                    </text>
                    {entry.loading && (
                      <text fg="#555" bg={POPUP_BG}>
                        {" "}
                        {SPINNER_FRAMES[spinFrame]}
                      </text>
                    )}
                    {!entry.loading && entry.count > 0 && (
                      <text fg="#333" bg={POPUP_BG}>
                        {" "}
                        {String(entry.count)}
                      </text>
                    )}
                    {!entry.avail && !entry.loading && (
                      <text fg="#333" bg={POPUP_BG}>
                        {" · no key"}
                      </text>
                    )}
                  </PopupRow>
                );
              }

              const entryIdx = entries.indexOf(entry);
              const active = entryIdx === cursor;
              const isCur = entry.fullId === activeModel;
              const bg = active ? POPUP_HL : POPUP_BG;
              const ctxStr = fmtCtx(entry.ctx);
              const checkW = isCur ? 2 : 0;
              const avail = iw - 6 - ctxStr.length - checkW;
              const nm =
                entry.name.length > avail
                  ? `${entry.name.slice(0, Math.max(0, avail - 1))}…`
                  : entry.name;
              const pad = Math.max(1, iw - 4 - nm.length - ctxStr.length - checkW);

              return (
                <box key={`m-${entry.fullId}`} flexDirection="column">
                  <PopupRow bg={bg} w={iw}>
                    <text fg={active ? "#FF0040" : "#555"} bg={bg}>
                      {active ? "› " : "  "}
                    </text>
                    <text
                      fg={active ? "#FF0040" : isCur ? "#00FF00" : "#aaa"}
                      bg={bg}
                      attributes={active ? TextAttributes.BOLD : undefined}
                    >
                      {nm}
                    </text>
                    {ctxStr ? (
                      <text fg={active ? "#994060" : "#444"} bg={bg}>
                        {" ".repeat(pad)}
                        {ctxStr}
                      </text>
                    ) : null}
                    {isCur && (
                      <text fg="#00FF00" bg={bg}>
                        {" ✓"}
                      </text>
                    )}
                  </PopupRow>
                  {entry.hasDesc && (
                    <PopupRow bg={bg} w={iw}>
                      <text fg={active ? "#888" : "#555"} bg={bg} truncate>
                        {"    "}
                        {entry.id.length > iw - 10 ? `${entry.id.slice(0, iw - 13)}…` : entry.id}
                      </text>
                    </PopupRow>
                  )}
                </box>
              );
            })}
          </box>
        )}

        {/* Spacer */}
        <PopupRow w={iw}>
          <text>{""}</text>
        </PopupRow>

        {/* Footer */}
        <PopupRow w={iw}>
          <text fg="#555" bg={POPUP_BG}>
            {"↑↓"} navigate | {"⏎"} select | tab next | esc {query ? "clear" : "close"}
          </text>
          {totalModels > 0 && (
            <text fg="#444" bg={POPUP_BG}>
              {"  "}
              {canScrollUp ? "↑" : " "}
              {String(cursorModelIdx)}/{String(totalModels)}
              {canScrollDown ? "↓" : " "}
            </text>
          )}
        </PopupRow>
      </box>
    </Overlay>
  );
});
