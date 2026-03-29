import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { memo, useState } from "react";
import { useTheme } from "../../core/theme/index.js";
import { TOOL_CATALOG } from "../../core/tools/constants.js";
import { usePopupScroll } from "../../hooks/usePopupScroll.js";
import { Overlay, POPUP_BG, POPUP_HL, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 100;
const CHROME_ROWS = 5;

interface ToolEntry {
  name: string;
  desc: string;
}

const ALL_TOOLS: ToolEntry[] = Object.entries(TOOL_CATALOG).map(([name, desc]) => ({
  name,
  desc,
}));

interface Props {
  visible: boolean;
  disabledTools: Set<string>;
  onToggleTool: (name: string) => void;
  onClose: () => void;
}

const ToolRow = memo(function ToolRow({
  tool,
  enabled,
  selected,
  w,
}: {
  tool: ToolEntry;
  enabled: boolean;
  selected: boolean;
  w: number;
}) {
  const t = useTheme();
  const bg = selected ? POPUP_HL : POPUP_BG;
  const check = enabled ? "x" : " ";
  const nameColor = enabled ? t.info : t.textMuted;
  const descColor = enabled ? t.textMuted : t.textDim;
  const maxDesc = Math.max(0, w - tool.name.length - 8);
  const desc = tool.desc.length > maxDesc ? `${tool.desc.slice(0, maxDesc - 1)}…` : tool.desc;

  return (
    <PopupRow bg={bg} w={w}>
      <text bg={bg} fg={enabled ? t.success : t.textMuted}>
        [{check}]
      </text>
      <text bg={bg} fg={nameColor}>
        {" "}
        {tool.name}
      </text>
      <text bg={bg} fg={descColor}>
        {" "}
        {desc}
      </text>
    </PopupRow>
  );
});

export function ToolsPopup({ visible, disabledTools, onToggleTool, onClose }: Props) {
  const t = useTheme();
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const popupW = Math.min(MAX_POPUP_WIDTH, termCols - 4);
  const innerW = popupW - 2;
  const maxVisible = Math.max(5, termRows - CHROME_ROWS - 4);

  const { cursor, setCursor, scrollOffset, adjustScroll } = usePopupScroll(maxVisible);
  const [initialized, setInitialized] = useState(false);
  if (visible && !initialized) {
    setCursor(0);
    adjustScroll(0);
    setInitialized(true);
  }
  if (!visible && initialized) setInitialized(false);

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape" || evt.name === "q") {
      onClose();
      return;
    }
    if (evt.name === "up" || evt.name === "k") {
      const next = Math.max(0, cursor - 1);
      setCursor(next);
      adjustScroll(next);
      return;
    }
    if (evt.name === "down" || evt.name === "j") {
      const next = Math.min(ALL_TOOLS.length - 1, cursor + 1);
      setCursor(next);
      adjustScroll(next);
      return;
    }
    if (evt.name === "return" || evt.name === " ") {
      const tool = ALL_TOOLS[cursor];
      if (tool) onToggleTool(tool.name);
    }
  });

  if (!visible) return null;

  const visibleItems = ALL_TOOLS.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Overlay>
      <box
        borderStyle="rounded"
        border
        borderColor={t.brandAlt}
        flexDirection="column"
        width={popupW}
      >
        <PopupRow w={innerW}>
          <text fg={t.brandAlt} attributes={TextAttributes.BOLD}>
            Tools
          </text>
          <text fg={t.textMuted}> — space to toggle, esc to close</text>
        </PopupRow>
        <PopupRow w={innerW}>
          <text fg={t.textFaint}>{"─".repeat(innerW)}</text>
        </PopupRow>

        {visibleItems.map((tool, i) => {
          const idx = scrollOffset + i;
          return (
            <ToolRow
              key={tool.name}
              tool={tool}
              enabled={!disabledTools.has(tool.name)}
              selected={cursor === idx}
              w={innerW}
            />
          );
        })}
      </box>
    </Overlay>
  );
}
