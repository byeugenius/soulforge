import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo } from "react";
import { saveGlobalConfig } from "../../../../config/index.js";
import { applyTheme, listThemes, useTheme, useThemeStore } from "../../../../core/theme/index.js";
import { usePopupScroll } from "../../../../hooks/usePopupScroll.js";
import { PopupRow, usePopupColors } from "../../../layout/shared.js";
import { Gap, Hr, StepHeader } from "../primitives.js";
import { BOLD } from "../theme.js";

interface ThemeStepProps {
  iw: number;
  active: boolean;
  setActive: (v: boolean) => void;
}

// Chrome rows within the wizard popup that aren't part of the theme list:
// progress(1) + hr(1) + gap(1) + header(1) + gap(1) + transparent(1) + hr(1) + gap(1)
// + gap(1) + help(1) + hr(1) + footer(1) = 12
const CHROME_ROWS = 12;

export function ThemeStep({ iw, setActive }: ThemeStepProps) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const themes = useMemo(() => listThemes(), []);
  const currentName = useThemeStore((s) => s.name);
  const isTransparent = useThemeStore((s) => s.tokens.bgApp === "transparent");

  const { height: termRows } = useTerminalDimensions();
  const maxH = Math.max(24, Math.floor(termRows * 0.7));
  const maxVisible = Math.max(4, maxH - CHROME_ROWS);

  const { cursor, setCursor, scrollOffset, adjustScroll } = usePopupScroll(maxVisible);

  // Initialize cursor to current theme
  useEffect(() => {
    const idx = themes.findIndex((th) => th.id === currentName);
    if (idx >= 0) {
      setCursor(idx);
      adjustScroll(idx);
    }
  }, [currentName, themes, setCursor, adjustScroll]);

  useEffect(() => {
    setActive(false);
  }, [setActive]);

  useKeyboard((evt) => {
    if (evt.name === "up") {
      const next = cursor > 0 ? cursor - 1 : themes.length - 1;
      setCursor(next);
      adjustScroll(next);
      const th = themes[next];
      if (th) applyTheme(th.id, isTransparent);
      return;
    }
    if (evt.name === "down") {
      const next = cursor < themes.length - 1 ? cursor + 1 : 0;
      setCursor(next);
      adjustScroll(next);
      const th = themes[next];
      if (th) applyTheme(th.id, isTransparent);
      return;
    }
    if (evt.name === "return") {
      const th = themes[cursor];
      if (th) {
        applyTheme(th.id, isTransparent);
        saveGlobalConfig({ theme: { name: th.id, transparent: isTransparent } } as Record<
          string,
          unknown
        >);
      }
      return;
    }
    if (evt.name === "tab") {
      const next = !isTransparent;
      const name = themes[cursor]?.id ?? currentName;
      applyTheme(name, next);
      saveGlobalConfig({ theme: { name, transparent: next } } as Record<string, unknown>);
    }
  });

  const visibleThemes = themes.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="◎" title="Pick Your Theme" />
      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={popupBg}>
          {"  Transparent "}
        </text>
        <text fg={isTransparent ? t.success : t.textDim} attributes={BOLD} bg={popupBg}>
          {isTransparent ? "[on]" : "[off]"}
        </text>
        <text fg={t.textDim} bg={popupBg}>
          {"  tab to toggle"}
        </text>
      </PopupRow>

      <Hr iw={iw} />
      <Gap iw={iw} />

      {visibleThemes.map((th, vi) => {
        const i = vi + scrollOffset;
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
        <text fg={t.textDim} bg={popupBg}>
          {"  ↑↓ preview · ⏎ apply · tab transparent · → next"}
        </text>
      </PopupRow>
    </>
  );
}
