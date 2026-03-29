import { memo } from "react";
import { useTheme } from "../../../core/theme/index.js";
import { POPUP_BG, PopupRow } from "../../layout/shared.js";
import { STEPS, type Step } from "./data.js";

export const FooterNav = memo(function FooterNav({
  iw,
  stepIdx,
  step,
}: {
  iw: number;
  stepIdx: number;
  step: Step;
}) {
  const t = useTheme();
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const actionLabel = step === "setup" ? "→ next step" : isLast ? "⏎ start forging" : "⏎/→ next";

  return (
    <PopupRow w={iw}>
      <text fg={t.textMuted} bg={POPUP_BG}>
        {isFirst ? "" : "← back │ "}
        {actionLabel}
        <span fg={t.textDim}>{" │ esc skip"}</span>
      </text>
    </PopupRow>
  );
});
