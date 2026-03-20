import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { Overlay, POPUP_BG, PopupRow } from "../layout/shared.js";

const CHROME_ROWS = 6;

export interface InfoPopupLine {
  type: "header" | "separator" | "entry" | "text" | "spacer" | "bar";
  label?: string;
  desc?: string;
  color?: string;
  descColor?: string;
  /** For "bar" type: 0–100 fill percentage */
  pct?: number;
  /** For "bar" type: bar fill color */
  barColor?: string;
}

export interface InfoPopupConfig {
  title: string;
  icon?: string;
  lines: InfoPopupLine[];
  width?: number;
  labelWidth?: number;
  onClose?: () => void;
}

interface Props {
  visible: boolean;
  config: InfoPopupConfig | null;
  onClose: () => void;
}

export function InfoPopup({ visible, config, onClose }: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const containerRows = termRows - 2;
  const maxWidth = config?.width ?? 68;
  const popupWidth = Math.min(maxWidth, Math.floor(termCols * 0.7));
  const innerW = popupWidth - 2;
  const labelW = config?.labelWidth ?? 20;
  const maxVisible = Math.max(6, Math.floor(containerRows * 0.7) - CHROME_ROWS);
  const maxTextW = innerW - 4;
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (visible) setScrollOffset(0);
  }, [visible]);

  useKeyboard((evt) => {
    if (!(visible && !!config)) return;
    if (evt.name === "escape") {
      onClose();
      return;
    }
    if (evt.name === "up" || evt.name === "k") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (evt.name === "down" || evt.name === "j") {
      const lines = config?.lines.length ?? 0;
      setScrollOffset((prev) => Math.min(Math.max(0, lines - maxVisible), prev + 1));
    }
  });

  if (!visible || !config) return null;

  const truncText = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

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
          {config.icon && (
            <text bg={POPUP_BG} fg="#9B30FF">
              {config.icon}{" "}
            </text>
          )}
          <text bg={POPUP_BG} fg="white" attributes={TextAttributes.BOLD}>
            {config.title}
          </text>
          <text bg={POPUP_BG} fg="#555">
            {"  "}↑↓ scroll
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#333">
            {"─".repeat(innerW - 2)}
          </text>
        </PopupRow>

        <box
          flexDirection="column"
          height={Math.min(config.lines.length, maxVisible)}
          overflow="hidden"
        >
          {config.lines.slice(scrollOffset, scrollOffset + maxVisible).map((line, vi) => {
            const key = String(vi + scrollOffset);
            switch (line.type) {
              case "header":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg="#8B5CF6" attributes={TextAttributes.BOLD}>
                      {truncText(line.label ?? "", maxTextW)}
                    </text>
                  </PopupRow>
                );
              case "separator":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg="#333">
                      {"─".repeat(innerW - 2)}
                    </text>
                  </PopupRow>
                );
              case "entry": {
                const descMax = maxTextW - labelW;
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg={line.color ?? "#FF0040"}>
                      {(line.label ?? "").padEnd(labelW).slice(0, labelW)}
                    </text>
                    <text bg={POPUP_BG} fg={line.descColor ?? "#666"}>
                      {truncText(line.desc ?? "", descMax)}
                    </text>
                  </PopupRow>
                );
              }
              case "text":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg={line.color ?? "#555"}>
                      {truncText(line.label ?? "", maxTextW)}
                    </text>
                  </PopupRow>
                );
              case "bar": {
                const descStr = line.desc ?? "";
                const barW = Math.max(4, innerW - labelW - descStr.length - 3);
                const fillPct = Math.min(100, Math.max(0, line.pct ?? 0));
                const filled = Math.max(fillPct > 0 ? 1 : 0, Math.round((fillPct / 100) * barW));
                const empty = barW - filled;
                const barFg =
                  line.barColor ?? (fillPct > 75 ? "#FF0040" : fillPct > 50 ? "#FF8C00" : "#2d5");
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg={line.color ?? "#ccc"}>
                      {(line.label ?? "").padEnd(labelW).slice(0, labelW)}
                    </text>
                    <text bg={POPUP_BG} fg={barFg}>
                      {"━".repeat(filled)}
                    </text>
                    <text bg={POPUP_BG} fg="#333">
                      {"─".repeat(empty)}
                    </text>
                    <text bg={POPUP_BG} fg={line.descColor ?? "#666"}>
                      {" "}
                      {descStr}
                    </text>
                  </PopupRow>
                );
              }
              case "spacer":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG}>{""}</text>
                  </PopupRow>
                );
              default:
                return null;
            }
          })}
        </box>
        {config.lines.length > maxVisible && (
          <PopupRow w={innerW}>
            <text fg="#555" bg={POPUP_BG}>
              {scrollOffset > 0 ? "↑ " : "  "}
              {String(scrollOffset + 1)}-
              {String(Math.min(scrollOffset + maxVisible, config.lines.length))}/
              {String(config.lines.length)}
              {scrollOffset + maxVisible < config.lines.length ? " ↓" : ""}
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text bg={POPUP_BG}>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#555">
            {"↑↓"} scroll | esc close
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
