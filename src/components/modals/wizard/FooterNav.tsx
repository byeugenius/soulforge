import { memo } from "react";
import { PopupFooterHints } from "../../layout/shared.js";
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
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const actionLabel = step === "setup" ? "next step" : isLast ? "start forging" : "next";
  const actionKey = step === "setup" ? "→" : isLast ? "⏎" : "⏎";

  return (
    <PopupFooterHints
      w={iw}
      hints={[
        ...(isFirst ? [] : [{ key: "←", label: "back" }]),
        { key: actionKey, label: actionLabel },
        { key: "esc", label: "close" },
      ]}
    />
  );
});
