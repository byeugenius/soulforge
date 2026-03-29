import { memo, useEffect, useRef, useState } from "react";
import { icon } from "../../../../core/icons.js";
import { useTheme } from "../../../../core/theme/index.js";
import { PopupRow, usePopupColors } from "../../../layout/shared.js";
import {
  BLINK_COUNT,
  BLINK_INITIAL_MS,
  BLINK_MS,
  TYPEWRITER_MS,
  WELCOME_BULLETS,
  WELCOME_TITLE,
} from "../data.js";
import { Gap } from "../primitives.js";
import { BOLD, ITALIC } from "../theme.js";

function useTypewriter(text: string, ms: number) {
  const [len, setLen] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        i++;
        setLen(i);
        timer.current = setTimeout(tick, ms);
      } else {
        let blinks = 0;
        const blink = () => {
          if (blinks >= BLINK_COUNT * 2) {
            setCursorOn(false);
            return;
          }
          blinks++;
          setCursorOn((v) => !v);
          timer.current = setTimeout(blink, BLINK_MS);
        };
        timer.current = setTimeout(blink, BLINK_INITIAL_MS);
      }
    };
    timer.current = setTimeout(tick, BLINK_INITIAL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, ms]);

  return { typed: text.slice(0, len), cursorOn };
}

export const WelcomeStep = memo(function WelcomeStep({ iw }: { iw: number }) {
  const t = useTheme();
  const { bg } = usePopupColors();
  const { typed, cursorOn } = useTypewriter(WELCOME_TITLE, TYPEWRITER_MS);
  const ghostIc = icon("ghost");

  return (
    <>
      <Gap iw={iw} n={2} />
      <PopupRow w={iw}>
        <text fg={t.brand} attributes={BOLD} bg={bg}>
          {"   "}
          {ghostIc}{" "}
        </text>
        <text fg={t.textPrimary} attributes={BOLD} bg={bg}>
          {typed}
        </text>
        <text fg={t.brand} bg={bg}>
          {cursorOn ? "▌" : " "}
        </text>
      </PopupRow>
      <Gap iw={iw} />
      <PopupRow w={iw}>
        <text fg={t.textSecondary} attributes={ITALIC} bg={bg}>
          {"   Graph-Powered Code Intelligence"}
        </text>
      </PopupRow>
      <Gap iw={iw} n={2} />
      {WELCOME_BULLETS.map((b) => (
        <PopupRow key={b} w={iw}>
          <text fg={t.brand} bg={bg}>
            {"   ◆ "}
          </text>
          <text fg={t.textSecondary} bg={bg}>
            {b}
          </text>
        </PopupRow>
      ))}
      <Gap iw={iw} n={2} />
      <PopupRow w={iw}>
        <text fg={t.textMuted} attributes={ITALIC} bg={bg}>
          {"   Press → or Enter to begin setup"}
        </text>
      </PopupRow>
    </>
  );
});
