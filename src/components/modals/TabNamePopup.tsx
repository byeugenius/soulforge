import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { useTheme } from "../../core/theme/index.js";
import { Popup, PopupRow } from "../layout/shared.js";

const POPUP_WIDTH = 44;

interface Props {
  visible: boolean;
  placeholder: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function TabNamePopup({ visible, placeholder, onSubmit, onClose }: Props) {
  const t = useTheme();
  const { width: termCols } = useTerminalDimensions();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (visible) setValue("");
  }, [visible]);

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape") {
      onClose();
      return;
    }
    if (evt.name === "return") {
      const name = value.trim();
      onSubmit(name);
      return;
    }
    if (evt.name === "backspace" || evt.name === "delete") {
      setValue((prev) => prev.slice(0, -1));
      return;
    }
    if (evt.name && evt.name.length === 1 && !evt.ctrl && !evt.meta) {
      setValue((prev) => {
        if (prev.length >= 30) return prev;
        return prev + evt.name;
      });
    }
  });

  if (!visible) return null;

  const w = Math.min(POPUP_WIDTH, Math.floor(termCols * 0.8));
  const iw = w - 2;
  const display = value || placeholder;

  return (
    <Popup
      width={w}
      title="New Tab"
      icon="+"
      footer={[
        { key: "Enter", label: "create" },
        { key: "Esc", label: "cancel" },
      ]}
    >
      <PopupRow w={iw}>
        <text fg={t.textSecondary}>Name: </text>
        <text fg={value ? t.textPrimary : t.textMuted}>{display}</text>
        <text fg={t.brand}>▎</text>
      </PopupRow>
    </Popup>
  );
}
