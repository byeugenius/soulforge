import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../../../core/theme/index.js";
import { Overlay, usePopupColors } from "../../layout/shared.js";
import { MAX_W, STEPS } from "./data.js";
import { FooterNav } from "./FooterNav.js";
import { ProgressBar } from "./ProgressBar.js";
import { Hr } from "./primitives.js";
import { FeaturesStep } from "./steps/FeaturesStep.js";
import { ReadyStep } from "./steps/ReadyStep.js";
import { SetupStep } from "./steps/SetupStep.js";
import { ShortcutsStep } from "./steps/ShortcutsStep.js";
import { ThemeStep } from "./steps/ThemeStep.js";
import { WelcomeStep } from "./steps/WelcomeStep.js";

interface Props {
  visible: boolean;
  hasModel: boolean;
  activeModel: string;
  onSelectModel: () => void;
  onClose: () => void;
}

export const FirstRunWizard = memo(function FirstRunWizard({
  visible,
  hasModel,
  activeModel,
  onSelectModel,
  onClose,
}: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const pw = Math.min(MAX_W, Math.floor(termCols * 0.92));
  const iw = pw - 2;

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx] ?? "welcome";
  const [setupActive, setSetupActive] = useState(false);

  const hasOpened = useRef(false);

  // Reset only on first open, not on reopen from model picker
  useEffect(() => {
    if (!visible) return;
    if (!hasOpened.current) {
      hasOpened.current = true;
      setStepIdx(0);
    }
    setSetupActive(false);
  }, [visible]);

  // Navigation
  const goForward = useCallback(() => {
    if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
    else onClose();
  }, [stepIdx, onClose]);

  const goBack = useCallback(() => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }, [stepIdx]);

  useKeyboard(
    useCallback(
      (evt) => {
        if (!visible) return;
        // Don't intercept when setup step is handling its own input
        if (setupActive) return;
        if (evt.name === "escape") {
          onClose();
          return;
        }
        if (step === "setup" || step === "theme") {
          // These steps handle their own ↑↓/⏎/tab — only →/← for navigation
          if (evt.name === "right" || evt.name === "l") {
            goForward();
            return;
          }
          if (evt.name === "left" || evt.name === "h") {
            goBack();
            return;
          }
          return;
        }
        if (evt.name === "return" || evt.name === "right" || evt.name === "l") {
          goForward();
          return;
        }
        if (evt.name === "left" || evt.name === "h") {
          goBack();
          return;
        }
      },
      [visible, onClose, goForward, goBack, setupActive, step],
    ),
  );

  const t = useTheme();
  const { bg } = usePopupColors();

  if (!visible) return null;

  const maxH = Math.max(24, Math.floor(termRows * 0.7));

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor={t.brandAlt}
        backgroundColor={bg}
        width={pw}
        height={maxH}
      >
        <ProgressBar iw={iw} stepIdx={stepIdx} />
        <Hr iw={iw} />

        {step === "welcome" && <WelcomeStep iw={iw} />}
        {step === "setup" && (
          <SetupStep
            iw={iw}
            hasModel={hasModel}
            activeModel={activeModel}
            onSelectModel={onSelectModel}
            active={setupActive}
            setActive={setSetupActive}
          />
        )}
        {step === "features" && <FeaturesStep iw={iw} />}
        {step === "shortcuts" && <ShortcutsStep iw={iw} />}
        {step === "theme" && <ThemeStep iw={iw} active={setupActive} setActive={setSetupActive} />}
        {step === "ready" && <ReadyStep iw={iw} />}

        <box flexGrow={1} backgroundColor={bg} />
        <Hr iw={iw} />
        <FooterNav iw={iw} stepIdx={stepIdx} step={step} />
      </box>
    </Overlay>
  );
});
