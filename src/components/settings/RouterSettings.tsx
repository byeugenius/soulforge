import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { memo } from "react";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import { usePopupScroll } from "../../hooks/usePopupScroll.js";
import type { TaskRouter } from "../../types/index.js";
import type { ConfigScope } from "../layout/shared.js";
import { CONFIG_SCOPES, Popup, POPUP_BG, POPUP_HL, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 76;
const CHROME_ROWS = 12;

// ── Section / slot definitions ──────────────────────────────────────────

interface SlotRow {
  kind: "slot";
  key: keyof TaskRouter;
  label: string;
  hint: string;
}

interface SectionRow {
  kind: "section";
  title: string;
  subtitle: string;
}

type ListRow = SlotRow | SectionRow;

const ROWS: ListRow[] = [
  // ── Main Agent ──
  {
    kind: "section",
    title: "Main Agent",
    subtitle: "Model that handles your conversation",
  },
  {
    kind: "slot",
    key: "default",
    label: `${icon("model")} Default`,
    hint: "Fallback for background tasks when no specific model is set",
  },
  // ── Dispatch ──
  {
    kind: "section",
    title: "Dispatch",
    subtitle: "Models for parallel subagents",
  },
  {
    kind: "slot",
    key: "spark",
    label: `${icon("read_only")} Explore`,
    hint: "Read-only agents — searches, reads, analyzes (doppelganger)",
  },
  {
    kind: "slot",
    key: "ember",
    label: `${icon("edit")} Code`,
    hint: "Edit agents — reads files, makes changes",
  },
  {
    kind: "slot",
    key: "webSearch",
    label: `${icon("web")} Web`,
    hint: "Searches the web & fetches pages",
  },
  // ── Post-Dispatch ──
  {
    kind: "section",
    title: "Post-Dispatch",
    subtitle: "Quality checks after code agents finish",
  },
  {
    kind: "slot",
    key: "desloppify",
    label: `${icon("cleanup")} Cleanup`,
    hint: "Post-dispatch polish & style fixes",
  },
  {
    kind: "slot",
    key: "verify",
    label: `${icon("review")} Review`,
    hint: "Adversarial review after code agents",
  },

  // ── Background ──
  {
    kind: "section",
    title: "Background",
    subtitle: "Internal tasks — usually fine on defaults",
  },
  {
    kind: "slot",
    key: "compact",
    label: `${icon("compact_task")} Compaction`,
    hint: "Summarizes old context when conversation grows long",
  },
  {
    kind: "slot",
    key: "semantic",
    label: `${icon("repomap")} Soul Map`,
    hint: "Generates symbol summaries for the repo map",
  },
];

// Flat list of only selectable (slot) rows, with their index into ROWS
const SELECTABLE: { row: SlotRow; rowIdx: number }[] = ROWS.reduce<
  { row: SlotRow; rowIdx: number }[]
>((acc, r, i) => {
  if (r.kind === "slot") acc.push({ row: r, rowIdx: i });
  return acc;
}, []);

// ── Sub-components ──────────────────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  innerW,
}: {
  title: string;
  subtitle: string;
  innerW: number;
}) {
  const t = useTheme();
  const lineW = Math.max(0, innerW - title.length - 5);
  return (
    <>
      <PopupRow w={innerW}>
        <text bg={POPUP_BG}>{""}</text>
      </PopupRow>
      <PopupRow w={innerW}>
        <text bg={POPUP_BG} fg={t.brandAlt} attributes={TextAttributes.BOLD}>
          {title}
        </text>
        <text bg={POPUP_BG} fg={t.textSubtle}>
          {" "}
          {"─".repeat(lineW)}
        </text>
      </PopupRow>
      <PopupRow w={innerW}>
        <text bg={POPUP_BG} fg={t.textMuted}>
          {subtitle}
        </text>
      </PopupRow>
    </>
  );
});

const SlotRowView = memo(function SlotRowView({
  slot,
  modelId,
  activeModel,
  selected,
  innerW,
}: {
  slot: SlotRow;
  modelId: string | null;
  activeModel: string;
  selected: boolean;
  innerW: number;
}) {
  const t = useTheme();
  const bg = selected ? POPUP_HL : POPUP_BG;
  const displayModel = modelId ?? activeModel;
  const isCustom = !!modelId;
  const labelW = 16;
  const modelMaxW = Math.max(10, innerW - labelW - 8);
  const truncModel =
    displayModel.length > modelMaxW ? `${displayModel.slice(0, modelMaxW - 3)}...` : displayModel;

  return (
    <PopupRow bg={bg} w={innerW}>
      <text bg={bg} fg={selected ? t.brand : t.textDim}>
        {selected ? "› " : "  "}
      </text>
      <text
        bg={bg}
        fg={selected ? "white" : t.textPrimary}
        attributes={selected ? TextAttributes.BOLD : undefined}
      >
        {slot.label.padEnd(labelW)}
      </text>
      <text bg={bg} fg={isCustom ? t.success : t.textMuted}>
        {isCustom ? "" : "↳ "}
        {truncModel}
      </text>
    </PopupRow>
  );
});

// ── Main component ──────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  router: TaskRouter | undefined;
  activeModel: string;
  scope: ConfigScope;
  onScopeChange: (toScope: ConfigScope, fromScope: ConfigScope) => void;
  onPickSlot: (slot: keyof TaskRouter) => void;
  onClearSlot: (slot: keyof TaskRouter) => void;
  onClose: () => void;
}

export function RouterSettings({
  visible,
  router,
  activeModel,
  scope,
  onScopeChange,
  onPickSlot,
  onClearSlot,
  onClose,
}: Props) {
  const t = useTheme();
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.85));
  const innerW = popupWidth - 2;
  const maxVisible = Math.max(6, termRows - CHROME_ROWS);
  const { cursor, setCursor, scrollOffset, adjustScroll } = usePopupScroll(maxVisible);

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape" || evt.name === "q") {
      onClose();
      return;
    }
    if (evt.name === "up" || evt.name === "k") {
      setCursor((c) => {
        const next = c > 0 ? c - 1 : SELECTABLE.length - 1;
        adjustScroll(next);
        return next;
      });
      return;
    }
    if (evt.name === "down" || evt.name === "j") {
      setCursor((c) => {
        const next = c < SELECTABLE.length - 1 ? c + 1 : 0;
        adjustScroll(next);
        return next;
      });
      return;
    }
    if (evt.name === "return") {
      const sel = SELECTABLE[cursor];
      if (sel) onPickSlot(sel.row.key);
      return;
    }
    if (evt.name === "d" || evt.name === "delete" || evt.name === "backspace") {
      const sel = SELECTABLE[cursor];
      if (sel) onClearSlot(sel.row.key);
      return;
    }
    if (evt.name === "left" || evt.name === "right") {
      const idx = CONFIG_SCOPES.indexOf(scope);
      const next =
        evt.name === "left"
          ? CONFIG_SCOPES[(idx - 1 + CONFIG_SCOPES.length) % CONFIG_SCOPES.length]
          : CONFIG_SCOPES[(idx + 1) % CONFIG_SCOPES.length];
      if (next !== scope) onScopeChange(next as ConfigScope, scope);
      return;
    }
  });

  if (!visible) return null;

  // Build the visible rows — we render ALL rows (sections + slots) but only
  // slots are selectable. We need to figure out which ROWS are visible based
  // on the scroll window over SELECTABLE items.
  const visibleSelectableStart = scrollOffset;
  const visibleSelectableEnd = Math.min(scrollOffset + maxVisible, SELECTABLE.length);

  // Find the ROWS range that covers the visible selectable items
  const firstRowIdx =
    visibleSelectableStart < SELECTABLE.length
      ? (SELECTABLE[visibleSelectableStart]?.rowIdx ?? 0)
      : 0;
  const lastRowIdx =
    visibleSelectableEnd > 0
      ? (SELECTABLE[visibleSelectableEnd - 1]?.rowIdx ?? ROWS.length - 1)
      : ROWS.length - 1;

  // Include section headers that appear before the first visible slot
  let renderStart = firstRowIdx;
  while (renderStart > 0 && ROWS[renderStart - 1]?.kind === "section") {
    renderStart--;
  }

  const selectedSlot = SELECTABLE[cursor];
  const selectedHint = selectedSlot?.row.hint ?? "";

  return (
    <Popup
      width={popupWidth}
      title="Task Router"
      icon={icon("router")}
      headerRight={
        <text bg={POPUP_BG} fg={t.textMuted}>
          {" — assign models to different tasks"}
        </text>
      }
      footer={[
        { key: "↑↓", label: "navigate" },
        { key: "⏎", label: "pick model" },
        { key: "d", label: "reset" },
        { key: "←→", label: "scope" },
        { key: "esc", label: "close" },
      ]}
    >
      {/* ── Scrollable body ── */}
      <box flexDirection="column" overflow="hidden">
        {ROWS.slice(renderStart, lastRowIdx + 1).map((row, _vi) => {
          if (row.kind === "section") {
            return (
              <SectionHeader
                key={row.title}
                title={row.title}
                subtitle={row.subtitle}
                innerW={innerW}
              />
            );
          }
          // Find which selectable index this slot corresponds to
          const selIdx = SELECTABLE.findIndex((s) => s.row.key === row.key);
          const isSelected = selIdx === cursor;
          const modelId = router?.[row.key] ?? null;
          return (
            <SlotRowView
              key={row.key}
              slot={row}
              modelId={modelId}
              activeModel={activeModel}
              selected={isSelected}
              innerW={innerW}
            />
          );
        })}
      </box>

      {/* ── Scroll indicator ── */}
      {SELECTABLE.length > maxVisible && (
        <PopupRow w={innerW}>
          <text fg={t.textMuted} bg={POPUP_BG}>
            {"  "}
            {scrollOffset > 0 ? "↑ " : "  "}
            {String(cursor + 1)}/{String(SELECTABLE.length)}
            {visibleSelectableEnd < SELECTABLE.length ? " ↓" : ""}
          </text>
        </PopupRow>
      )}

      {/* ── Selected slot hint ── */}
      <PopupRow w={innerW}>
        <text bg={POPUP_BG} fg={t.textSubtle}>
          {"─".repeat(innerW - 2)}
        </text>
      </PopupRow>
      <PopupRow w={innerW}>
        <text bg={POPUP_BG} fg={t.textSecondary}>
          {selectedHint}
        </text>
      </PopupRow>

      {/* ── Scope selector ── */}
      <PopupRow w={innerW}>
        <text bg={POPUP_BG} fg={t.textSubtle}>
          {"─".repeat(innerW - 2)}
        </text>
      </PopupRow>
      <PopupRow w={innerW}>
        <text bg={POPUP_BG} fg={t.textMuted}>
          {"Scope "}
        </text>
        {CONFIG_SCOPES.map((s) => (
          <text
            key={s}
            bg={POPUP_BG}
            fg={s === scope ? t.brandAlt : t.textDim}
            attributes={s === scope ? TextAttributes.BOLD : undefined}
          >
            {s === scope ? ` [${s}] ` : `  ${s}  `}
          </text>
        ))}
      </PopupRow>

      {/* ── Keybindings ── */}
    </Popup>
  );
}
