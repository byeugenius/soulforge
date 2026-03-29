import { memo } from "react";
import { icon } from "../../../../core/icons.js";
import { useTheme } from "../../../../core/theme/index.js";
import { POPUP_BG, PopupRow } from "../../../layout/shared.js";
import { QUICK_START } from "../data.js";
import { Gap, SectionLabel, StepHeader } from "../primitives.js";
import { ITALIC } from "../theme.js";

export const ReadyStep = memo(function ReadyStep({ iw }: { iw: number }) {
  const t = useTheme();
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic={icon("ghost")} title="You're All Set" />
      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={POPUP_BG}>
          Just type what you want to build, fix, or explore.
        </text>
      </PopupRow>
      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={POPUP_BG}>
          SoulForge reads your codebase, plans changes, and edits files —
        </text>
      </PopupRow>
      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={POPUP_BG}>
          all from this terminal.
        </text>
      </PopupRow>

      <Gap iw={iw} />

      <SectionLabel iw={iw} label="Quick start ideas:" />

      <Gap iw={iw} />

      {QUICK_START.map((q) => (
        <PopupRow key={q} w={iw}>
          <text fg={t.textDim} bg={POPUP_BG}>
            {"  "}
            <span fg={t.textSecondary}>{q}</span>
          </text>
        </PopupRow>
      ))}

      <Gap iw={iw} n={2} />

      <PopupRow w={iw}>
        <text fg={t.success} bg={POPUP_BG}>
          ✓ Ready to forge.
        </text>
        <text fg={t.textMuted} bg={POPUP_BG}>
          {"  "}
          <span fg={t.brandSecondary} attributes={ITALIC}>
            speak to the forge...
          </span>
        </text>
      </PopupRow>

      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textFaint} bg={POPUP_BG}>
          Re-run this wizard anytime with <span fg={t.textMuted}>soulforge --wizard</span>
        </text>
      </PopupRow>
    </>
  );
});
