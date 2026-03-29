import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { saveGlobalConfig } from "../../../../config/index.js";
import { applyTheme, listThemes, useTheme, useThemeStore } from "../../../../core/theme/index.js";
import { PopupRow, usePopupColors } from "../../../layout/shared.js";
import { Gap, StepHeader } from "../primitives.js";
import { BOLD } from "../theme.js";

interface ThemeStepProps {
  iw: number;
  active: boolean;
  setActive: (v: boolean) => void;
}

export function ThemeStep({ iw, setActive }: ThemeStepProps) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const themes = listThemes();
  const currentName = useThemeStore((s) => s.name);
  const currentIdx = themes.findIndex((th) => th.id === currentName);
  const [cursor, setCursor] = useState(Math.max(0, currentIdx));
  const isTransparent = useThemeStore((s) => s.tokens.bgApp === "transparent");
  const [transparent, setTransparent] = useState(isTransparent);

  // Never block wizard navigation — ↑↓/⏎/tab don't conflict with →/←/esc
  setActive(false);

  useKeyboard((evt) => {
    if (evt.name === "up") {
      const next = cursor > 0 ? cursor - 1 : themes.length - 1;
      setCursor(next);
      const th = themes[next];
      if (th) applyTheme(th.id, transparent);
      return;
    }
    if (evt.name === "down") {
      const next = cursor < themes.length - 1 ? cursor + 1 : 0;
      setCursor(next);
      const th = themes[next];
      if (th) applyTheme(th.id, transparent);
      return;
    }
    if (evt.name === "return") {
      const th = themes[cursor];
      if (th) {
        applyTheme(th.id, transparent);
        saveGlobalConfig({ theme: { name: th.id, transparent } } as Record<string, unknown>);
      }
      return;
    }
    if (evt.name === "tab") {
      const next = !transparent;
      setTransparent(next);
      const th = themes[cursor];
      if (th) {
        applyTheme(th.id, next);
        saveGlobalConfig({ theme: { name: th.id, transparent: next } } as Record<string, unknown>);
      }
    }
  });

  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="◎" title="Pick Your Theme" />
      <Gap iw={iw} />

      {themes.map((th, i) => {
        const isSelected = i === cursor;
        const bg = isSelected ? popupHl : popupBg;
        const isCurrent = th.id === currentName;
        const variantIcon = th.variant === "light" ? "☀" : "☾";

        return (
          <PopupRow key={th.id} w={iw}>
            <text bg={bg} fg={isSelected ? t.textPrimary : t.textMuted}>
              {isSelected ? "› " : "  "}
            </text>
            <text bg={bg} fg={th.brand} attributes={BOLD}>
              {"■■ "}
            </text>
            <text bg={bg} fg={isSelected ? t.textPrimary : t.textSecondary}>
              {variantIcon} {th.label}
            </text>
            {isCurrent && (
              <text bg={bg} fg={t.success} attributes={TextAttributes.BOLD}>
                {" ✓"}
              </text>
            )}
          </PopupRow>
        );
      })}

      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={popupBg}>
          {"  Transparent "}
        </text>
        <text fg={transparent ? t.success : t.textDim} attributes={BOLD} bg={popupBg}>
          {transparent ? "[on]" : "[off]"}
        </text>
        <text fg={t.textDim} bg={popupBg}>
          {"  tab to toggle"}
        </text>
      </PopupRow>

      <Gap iw={iw} />
      <PopupRow w={iw}>
        <text fg={t.textDim} bg={popupBg}>
          {"  ↑↓ preview · ⏎ apply · tab transparent · → next"}
        </text>
      </PopupRow>
    </>
  );
}
