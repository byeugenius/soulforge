import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import { icon } from "../../core/icons.js";
import { type RepoMapStatus, useRepoMapStore } from "../../stores/repomap.js";
import { Overlay, POPUP_BG, PopupRow, SPINNER_FRAMES } from "../layout/shared.js";

const LABEL_W = 18;
const POPUP_W = 56;

function statusColor(status: RepoMapStatus): string {
  switch (status) {
    case "scanning":
      return "#FF8C00";
    case "ready":
      return "#2d5";
    case "error":
      return "#FF0040";
    default:
      return "#555";
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

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function RepoMapStatusPopup({ visible, onClose }: Props) {
  const { width: termCols } = useTerminalDimensions();
  const popupWidth = Math.min(POPUP_W, Math.floor(termCols * 0.7));
  const innerW = popupWidth - 2;

  const stateRef = useRef(useRepoMapStore.getState());
  const [, setRenderTick] = useState(0);
  const spinnerRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    // Sync current state immediately on open — stateRef may be stale from mount time
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
      const { status, semanticStatus } = stateRef.current;
      if (status === "scanning" || semanticStatus === "generating") {
        spinnerRef.current++;
        setRenderTick((n) => n + 1);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [visible]);

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape" || evt.name === "backspace" || evt.name === "q") onClose();
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
  } = stateRef.current;
  const frame = SPINNER_FRAMES[spinnerRef.current % SPINNER_FRAMES.length] ?? "⠋";

  const statusLabel =
    status === "scanning"
      ? `${frame} scanning${scanProgress ? ` (${scanProgress})` : ""}`
      : status === "ready"
        ? "● active"
        : status === "error"
          ? "● error"
          : "● off";

  const semanticLabel =
    semanticStatus === "generating"
      ? `${frame} ${semanticProgress || "generating..."}`
      : semanticStatus === "ready"
        ? `● ${semanticProgress || `${String(semanticCount)} cached`}`
        : semanticStatus === "error"
          ? "● error"
          : "● off";

  const semanticColor =
    semanticStatus === "generating"
      ? "#FF8C00"
      : semanticStatus === "ready"
        ? "#2d5"
        : semanticStatus === "error"
          ? "#FF0040"
          : "#555";

  const rows: Array<{ label: string; value: string; valueColor?: string }> = [
    { label: "Status", value: statusLabel, valueColor: statusColor(status) },
    { label: "Files", value: String(files) },
    { label: "Symbols", value: String(symbols) },
    { label: "Edges", value: String(edges) },
    { label: "DB Size", value: formatBytes(dbSize) },
    { label: "Semantic", value: semanticLabel, valueColor: semanticColor },
    ...(semanticModel && semanticStatus !== "off"
      ? [{ label: "Semantic Model", value: semanticModel, valueColor: "#8B5CF6" }]
      : []),
    ...(semanticTokensIn > 0 || semanticTokensOut > 0
      ? [
          {
            label: "LLM Tokens",
            value: `↑${formatTokens(semanticTokensIn)} ↓${formatTokens(semanticTokensOut)} (${formatTokens(semanticTokensIn + semanticTokensOut)} total)`,
            valueColor: "#FF8C00",
          },
        ]
      : []),
    ...(scanError ? [{ label: "Error", value: scanError, valueColor: "#FF0040" }] : []),
  ];

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
          <text bg={POPUP_BG} fg="#9B30FF">
            {`${icon("repomap")} `}
          </text>
          <text bg={POPUP_BG} fg="white" attributes={TextAttributes.BOLD}>
            Soul Map Status
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#333">
            {"─".repeat(innerW - 2)}
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG}>{""}</text>
        </PopupRow>

        {rows.map((row) => (
          <PopupRow key={row.label} w={innerW}>
            <text bg={POPUP_BG} fg="#FF0040" attributes={TextAttributes.BOLD}>
              {row.label.padEnd(LABEL_W).slice(0, LABEL_W)}
            </text>
            <text bg={POPUP_BG} fg={row.valueColor ?? "#666"}>
              {row.value}
            </text>
          </PopupRow>
        ))}

        <PopupRow w={innerW}>
          <text bg={POPUP_BG}>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#555">
            AST index with PageRank ranking
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG}>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#555">
            esc close
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
