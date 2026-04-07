import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import { icon } from "../../core/icons.js";
import { type ThemeTokens, useTheme } from "../../core/theme/index.js";
import { type RepoMapStatus, useRepoMapStore } from "../../stores/repomap.js";
import {
  Overlay,
  POPUP_BG,
  POPUP_HL,
  PopupFooterHints,
  PopupRow,
  SPINNER_FRAMES,
} from "../layout/shared.js";

const LABEL_W = 18;
const POPUP_W = 72;

const SEMANTIC_MODES = ["off", "ast", "synthetic", "llm", "full"] as const;
type SemanticMode = (typeof SEMANTIC_MODES)[number];

const MODE_DESCRIPTIONS: Record<SemanticMode, string> = {
  off: "disabled",
  ast: "extracts existing docstrings (0 cost)",
  synthetic: "ast + names \u2192 words (0 cost, instant)",
  llm: "ast + AI summaries (top N by PageRank)",
  full: "llm + synthetic fill (best search quality)",
};

const MODE_LABELS: Record<SemanticMode, string> = {
  off: "off",
  ast: "ast",
  synthetic: "synthetic",
  llm: "llm",
  full: "full",
};

const LLM_LIMIT_PRESETS = [100, 200, 300, 500];

const TOKEN_BUDGET_PRESETS = [2000, 4000, 8000, 16000] as const;

function statusColor(status: RepoMapStatus, t: ThemeTokens): string {
  switch (status) {
    case "scanning":
      return t.warning;
    case "ready":
      return t.success;
    case "error":
      return t.error;
    default:
      return t.textMuted;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

type ConfigScope = "project" | "global";

interface Props {
  visible: boolean;
  onClose: () => void;
  enabled?: boolean;
  currentMode?: string;
  currentLimit?: number;
  currentAutoRegen?: boolean;
  currentTokenBudget?: number;
  currentScope?: ConfigScope;
  onToggle?: (enabled: boolean, scope: ConfigScope) => void;
  onRefresh?: () => void;
  onClear?: (scope: ConfigScope) => void;
  onRegenerate?: () => void;
  onClearSummaries?: () => void;
  onLspEnrich?: () => void;
  onApply?: (
    mode: string,
    limit: number,
    autoRegen: boolean,
    scope: ConfigScope,
    tokenBudget: number | undefined,
  ) => void;
}

enum FocusRow {
  Mode = 0,
  Limit = 1,
  Budget = 2,
}

export function RepoMapStatusPopup({
  visible,
  onClose,
  enabled = true,
  currentMode,
  currentLimit,
  currentAutoRegen,
  currentTokenBudget,
  currentScope,
  onToggle,
  onRefresh,
  onClear,
  onRegenerate,
  onClearSummaries,
  onLspEnrich,
  onApply,
}: Props) {
  const t = useTheme();
  const { width: termCols } = useTerminalDimensions();
  const popupWidth = Math.min(POPUP_W, Math.floor(termCols * 0.8));
  const innerW = popupWidth - 2;

  const stateRef = useRef(useRepoMapStore.getState());
  const [, setRenderTick] = useState(0);
  const spinnerRef = useRef(0);

  const initialMode = (currentMode ?? "off") as SemanticMode;
  const initialLimit = currentLimit ?? 300;

  const [selectedMode, setSelectedMode] = useState<SemanticMode>(initialMode);
  const [selectedLimit, setSelectedLimit] = useState(initialLimit);
  const [selectedAutoRegen, setSelectedAutoRegen] = useState(currentAutoRegen ?? false);
  const [selectedTokenBudget, setSelectedTokenBudget] = useState<number | undefined>(
    currentTokenBudget,
  );
  const [selectedScope, setSelectedScope] = useState<ConfigScope>(currentScope ?? "project");
  const [focusRow, setFocusRow] = useState<FocusRow>(FocusRow.Mode);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedMode((currentMode ?? "off") as SemanticMode);
    setSelectedLimit(currentLimit ?? 300);
    setSelectedAutoRegen(currentAutoRegen ?? false);
    setSelectedTokenBudget(currentTokenBudget);
    setSelectedScope(currentScope ?? "project");
    setFocusRow(FocusRow.Mode);
    setConfirmClear(false);
  }, [visible, currentMode, currentLimit, currentAutoRegen, currentTokenBudget, currentScope]);

  useEffect(() => {
    if (!visible) return;
    stateRef.current = useRepoMapStore.getState();
    setRenderTick((n) => n + 1);
    return useRepoMapStore.subscribe((s) => {
      stateRef.current = s;
      setRenderTick((n) => n + 1);
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      const { status, semanticStatus, lspStatus: ls } = stateRef.current;
      if (status === "scanning" || semanticStatus === "generating" || ls === "generating") {
        spinnerRef.current++;
        setRenderTick((n) => n + 1);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [visible]);

  const hasConfig = onApply !== undefined;
  const isModified =
    selectedMode !== (currentMode ?? "off") ||
    selectedLimit !== (currentLimit ?? 300) ||
    selectedAutoRegen !== (currentAutoRegen ?? false) ||
    selectedTokenBudget !== currentTokenBudget ||
    selectedScope !== (currentScope ?? "project");

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape" || evt.name === "q") {
      onClose();
      return;
    }
    if (!hasConfig) {
      if (evt.name === "backspace") onClose();
      return;
    }

    // Tab toggles scope
    if (evt.name === "tab") {
      setSelectedScope((s) => (s === "project" ? "global" : "project"));
      return;
    }

    if (evt.name === "up" || evt.name === "down") {
      const dir = evt.name === "down" ? 1 : -1;
      const showLimit = selectedMode === "llm" || selectedMode === "full";
      const rows = [FocusRow.Mode, ...(showLimit ? [FocusRow.Limit] : []), FocusRow.Budget];
      setFocusRow((r) => {
        const idx = rows.indexOf(r);
        const next = (idx + dir + rows.length) % rows.length;
        return rows[next] as FocusRow;
      });
      return;
    }

    if (evt.name === "left" || evt.name === "right") {
      const dir = evt.name === "right" ? 1 : -1;
      if (focusRow === FocusRow.Mode) {
        setSelectedMode((m) => {
          const idx = SEMANTIC_MODES.indexOf(m);
          const next = (idx + dir + SEMANTIC_MODES.length) % SEMANTIC_MODES.length;
          return SEMANTIC_MODES[next] as SemanticMode;
        });
      } else if (focusRow === FocusRow.Limit) {
        setSelectedLimit((lim) => {
          const idx = LLM_LIMIT_PRESETS.indexOf(lim);
          if (idx < 0) return LLM_LIMIT_PRESETS[0] as number;
          const next = (idx + dir + LLM_LIMIT_PRESETS.length) % LLM_LIMIT_PRESETS.length;
          return LLM_LIMIT_PRESETS[next] as number;
        });
      } else {
        setSelectedTokenBudget((b) => {
          if (b === undefined)
            return dir > 0
              ? TOKEN_BUDGET_PRESETS[0]
              : TOKEN_BUDGET_PRESETS[TOKEN_BUDGET_PRESETS.length - 1];
          const idx = TOKEN_BUDGET_PRESETS.indexOf(b as (typeof TOKEN_BUDGET_PRESETS)[number]);
          if (idx < 0) return TOKEN_BUDGET_PRESETS[0];
          const next = idx + dir;
          if (next < 0) return undefined;
          if (next >= TOKEN_BUDGET_PRESETS.length) return undefined;
          return TOKEN_BUDGET_PRESETS[next];
        });
      }
      return;
    }

    const numKey = Number.parseInt(evt.sequence ?? "", 10);
    if (numKey >= 1 && numKey <= SEMANTIC_MODES.length) {
      setSelectedMode(SEMANTIC_MODES[numKey - 1] as SemanticMode);
      return;
    }

    if (evt.name === "return" && isModified) {
      onApply(selectedMode, selectedLimit, selectedAutoRegen, selectedScope, selectedTokenBudget);
      return;
    }

    // Action shortcuts
    if (evt.ctrl) return; // Ignore Ctrl+letter combos (Ctrl+C to quit, etc.)
    // Reset confirm state on any key that isn't 'c'
    if (evt.sequence !== "c" && confirmClear) setConfirmClear(false);
    if (evt.sequence === "r" && onRefresh && enabled) {
      onRefresh();
      return;
    }
    if (evt.sequence === "x" && onClear && enabled) {
      onClear(selectedScope);
      return;
    }
    if (evt.sequence === "g" && onRegenerate && enabled) {
      onRegenerate();
      return;
    }
    if (evt.sequence === "c" && onClearSummaries && enabled) {
      if (confirmClear) {
        setConfirmClear(false);
        onClearSummaries();
      } else {
        setConfirmClear(true);
      }
      return;
    }
    if (evt.sequence === "a" && hasConfig && enabled) {
      setSelectedAutoRegen((v) => !v);
      return;
    }
    if (evt.sequence === "l" && onLspEnrich && enabled) {
      onLspEnrich();
      return;
    }
    if (evt.sequence === "e" && onToggle) {
      onToggle(!enabled, selectedScope);
      return;
    }
  });

  if (!visible) return null;

  const {
    status,
    files,
    symbols,
    edges,
    dbSizeBytes: dbSize,
    scanProgress,
    scanError,
    semanticStatus,
    semanticCount,
    semanticProgress,
    semanticModel,
    semanticTokensIn,
    semanticTokensOut,
    semanticTokensCache,
    lspStatus,
    lspProgress,
  } = stateRef.current;
  const frame = SPINNER_FRAMES[spinnerRef.current % SPINNER_FRAMES.length] ?? "\u280B";

  const statusLabel =
    status === "scanning"
      ? `${frame} scanning${scanProgress ? ` (${scanProgress})` : ""}`
      : status === "ready"
        ? "\u25CF active"
        : status === "error"
          ? "\u25CF error"
          : "\u25CF off";

  const semanticLabel =
    semanticStatus === "generating"
      ? `${frame} ${semanticProgress || "generating..."}`
      : semanticStatus === "ready"
        ? `\u25CF ${semanticProgress || `${String(semanticCount)} cached`}`
        : semanticStatus === "error"
          ? `\u25CF error${semanticProgress ? ` (${semanticProgress})` : ""}`
          : `\u25CF ${semanticProgress || "off"}`;

  const semanticColor =
    semanticStatus === "generating"
      ? t.warning
      : semanticStatus === "ready"
        ? t.success
        : semanticStatus === "error"
          ? t.error
          : t.textMuted;

  const lspLabel =
    lspStatus === "generating"
      ? `${frame} ${lspProgress || "enriching..."}`
      : lspStatus === "ready"
        ? `\u25CF ${lspProgress || "ready"}`
        : lspStatus === "error"
          ? `\u25CF ${lspProgress || "error"}`
          : "\u25CF off";

  const lspColor =
    lspStatus === "generating"
      ? t.warning
      : lspStatus === "ready"
        ? t.success
        : lspStatus === "error"
          ? t.error
          : t.textMuted;

  const rows: Array<{ label: string; value: string; valueColor?: string }> = [
    { label: "Status", value: statusLabel, valueColor: statusColor(status, t) },
    { label: "Files", value: String(files) },
    { label: "Symbols", value: String(symbols) },
    { label: "Edges", value: String(edges) },
    { label: "DB Size", value: formatBytes(dbSize) },
    { label: "Semantic", value: semanticLabel, valueColor: semanticColor },
    ...(semanticModel && semanticStatus !== "off"
      ? [{ label: "Semantic Model", value: semanticModel, valueColor: t.brandAlt }]
      : []),
    ...(semanticTokensIn > 0 || semanticTokensOut > 0
      ? [
          {
            label: "LLM Tokens",
            value: `\u2191${formatTokens(semanticTokensIn)} \u2193${formatTokens(semanticTokensOut)}${semanticTokensCache > 0 ? ` (${String(Math.round((semanticTokensCache / semanticTokensIn) * 100))}% cached)` : ""}`,
            valueColor: t.warning,
          },
        ]
      : []),
    { label: "LSP", value: lspLabel, valueColor: lspColor },
    ...(scanError ? [{ label: "Error", value: scanError, valueColor: t.error }] : []),
  ];

  const modeChips = SEMANTIC_MODES.map((m) => {
    const active = m === selectedMode;
    return { mode: m, label: MODE_LABELS[m] as string, active };
  });

  const limitPresetChips = LLM_LIMIT_PRESETS.map((v) => ({
    value: v,
    active: v === selectedLimit,
  }));

  const budgetChips = [
    {
      value: undefined as number | undefined,
      label: "auto",
      active: selectedTokenBudget === undefined,
    },
    ...TOKEN_BUDGET_PRESETS.map((v) => ({
      value: v as number | undefined,
      label: `${String(v / 1000)}k`,
      active: selectedTokenBudget === v,
    })),
  ];

  const showLimitRow = selectedMode === "llm" || selectedMode === "full";
  const modeBg = focusRow === FocusRow.Mode ? POPUP_HL : POPUP_BG;
  const limitBg = focusRow === FocusRow.Limit ? POPUP_HL : POPUP_BG;
  const budgetBg = focusRow === FocusRow.Budget ? POPUP_HL : POPUP_BG;

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor={t.brandAlt}
        width={popupWidth}
      >
        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.brand}>
            {`${icon("repomap")} `}
          </text>
          <text bg={POPUP_BG} fg={t.textPrimary} attributes={TextAttributes.BOLD}>
            Soul Map
          </text>
          {hasConfig && (
            <text bg={POPUP_BG} fg={selectedScope === "project" ? t.info : t.warning}>
              {`  [${selectedScope}]`}
            </text>
          )}
          {isModified && (
            <text bg={POPUP_BG} fg={t.warning}>
              {" [modified]"}
            </text>
          )}
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.textFaint}>
            {"\u2500".repeat(innerW - 2)}
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG}>{""}</text>
        </PopupRow>

        {rows.map((row) => (
          <PopupRow key={row.label} w={innerW}>
            <text bg={POPUP_BG} fg={t.brandSecondary} attributes={TextAttributes.BOLD}>
              {row.label.padEnd(LABEL_W).slice(0, LABEL_W)}
            </text>
            <text bg={POPUP_BG} fg={row.valueColor ?? t.textMuted}>
              {row.value.length > innerW - LABEL_W
                ? `${row.value.slice(0, innerW - LABEL_W - 1)}\u2026`
                : row.value}
            </text>
          </PopupRow>
        ))}

        {(onToggle || onRefresh || onClear) && (
          <>
            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>
            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>
                {"  "}
                {onToggle && (
                  <span fg={enabled ? t.brandSecondary : t.success}>
                    {enabled ? "[E] disable" : "[E] enable"}
                    {"   "}
                  </span>
                )}
                {enabled && <span fg={t.info}>{"[R] refresh"}</span>}
                {enabled && <span fg={t.warning}>{"   [X] clear index"}</span>}
              </text>
            </PopupRow>
            {!enabled && (
              <PopupRow w={innerW}>
                <text bg={POPUP_BG} fg={t.warning}>
                  {"  Soul map disabled — soul tools inactive, saves ~4-8k prompt tokens"}
                </text>
              </PopupRow>
            )}
          </>
        )}

        {hasConfig && enabled && (
          <>
            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.textFaint}>
                {"\u2500".repeat(innerW - 2)}
              </text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.brand} attributes={TextAttributes.BOLD}>
                Semantic Summaries
              </text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>

            <PopupRow bg={modeBg} w={innerW}>
              <text bg={modeBg} fg={focusRow === FocusRow.Mode ? t.brandSecondary : t.textMuted}>
                {focusRow === FocusRow.Mode ? "\u203A " : "  "}
              </text>
              <text
                bg={modeBg}
                fg={focusRow === FocusRow.Mode ? "white" : t.textSecondary}
                attributes={focusRow === FocusRow.Mode ? TextAttributes.BOLD : undefined}
              >
                {"Mode  "}
              </text>
              {modeChips.map((chip) => (
                <text
                  key={chip.mode}
                  bg={modeBg}
                  fg={chip.active ? t.success : t.textMuted}
                  attributes={chip.active ? TextAttributes.BOLD : undefined}
                >
                  {chip.active ? `[${chip.label}]` : ` ${chip.label} `}{" "}
                </text>
              ))}
            </PopupRow>

            {showLimitRow && (
              <PopupRow bg={limitBg} w={innerW}>
                <text
                  bg={limitBg}
                  fg={focusRow === FocusRow.Limit ? t.brandSecondary : t.textMuted}
                >
                  {focusRow === FocusRow.Limit ? "\u203A " : "  "}
                </text>
                <text
                  bg={limitBg}
                  fg={focusRow === FocusRow.Limit ? "white" : t.textSecondary}
                  attributes={focusRow === FocusRow.Limit ? TextAttributes.BOLD : undefined}
                >
                  {"LLM Limit  "}
                </text>
                {limitPresetChips.map((chip) => (
                  <text
                    key={chip.value}
                    bg={limitBg}
                    fg={chip.active ? t.success : t.textMuted}
                    attributes={chip.active ? TextAttributes.BOLD : undefined}
                  >
                    {chip.active ? `[${String(chip.value)}]` : ` ${String(chip.value)} `}{" "}
                  </text>
                ))}
                <text bg={limitBg} fg={t.textMuted}>
                  symbols
                </text>
              </PopupRow>
            )}

            {showLimitRow && (
              <PopupRow w={innerW}>
                <text bg={POPUP_BG}>
                  {"    "}
                  <span fg={t.textMuted}>{"Auto-regen  "}</span>
                  <span
                    fg={selectedAutoRegen ? t.success : t.textMuted}
                    attributes={TextAttributes.BOLD}
                  >
                    {selectedAutoRegen ? "[on]" : "[off]"}
                  </span>
                  <span fg={t.textDim}>{" (a toggle) — costs tokens on each file change"}</span>
                </text>
              </PopupRow>
            )}

            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.textMuted}>
                {`  ${selectedMode.padEnd(11)}\u2014 ${MODE_DESCRIPTIONS[selectedMode]}`}
              </text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>
                {"  "}
                <span fg={t.info}>{"[G] regenerate"}</span>
                {confirmClear ? (
                  <span fg={t.brandSecondary} attributes={TextAttributes.BOLD}>
                    {"   [C] CONFIRM clear (preserves LLM)"}
                  </span>
                ) : (
                  <span fg={t.warning}>{"   [C] clear summaries"}</span>
                )}
                {onLspEnrich ? <span fg={t.success}>{"   [L] lsp enrich"}</span> : null}
              </text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.textFaint}>
                {"\u2500".repeat(innerW - 2)}
              </text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.brand} attributes={TextAttributes.BOLD}>
                Map Token Budget
              </text>
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG}>{""}</text>
            </PopupRow>

            <PopupRow bg={budgetBg} w={innerW}>
              <text
                bg={budgetBg}
                fg={focusRow === FocusRow.Budget ? t.brandSecondary : t.textMuted}
              >
                {focusRow === FocusRow.Budget ? "\u203A " : "  "}
              </text>
              <text
                bg={budgetBg}
                fg={focusRow === FocusRow.Budget ? "white" : t.textSecondary}
                attributes={focusRow === FocusRow.Budget ? TextAttributes.BOLD : undefined}
              >
                {"Budget  "}
              </text>
              {budgetChips.map((chip) => (
                <text
                  key={chip.label}
                  bg={budgetBg}
                  fg={chip.active ? t.success : t.textMuted}
                  attributes={chip.active ? TextAttributes.BOLD : undefined}
                >
                  {chip.active ? `[${chip.label}]` : ` ${chip.label} `}{" "}
                </text>
              ))}
            </PopupRow>

            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.textDim}>
                {"    "}
                {selectedTokenBudget === undefined
                  ? "scales with conversation length (1.5k\u20134k)"
                  : `fixed ${String(selectedTokenBudget / 1000)}k tokens — more files visible, higher prompt cost`}
              </text>
            </PopupRow>

            <PopupFooterHints
              w={innerW}
              hints={[
                { key: "↑↓", label: "focus" },
                { key: "←→", label: "change" },
                { key: "tab", label: "scope" },
                { key: "1-5", label: "mode" },
                { key: "⏎", label: "apply" },
                { key: "esc", label: "close" },
              ]}
            />
          </>
        )}

        {!hasConfig && (
          <PopupFooterHints
            w={innerW}
            hints={[
              { key: "E", label: enabled ? "disable" : "enable" },
              { key: "R", label: "refresh" },
              { key: "X", label: "clear" },
              { key: "tab", label: "scope" },
              { key: "esc", label: "close" },
            ]}
          />
        )}
      </box>
    </Overlay>
  );
}
