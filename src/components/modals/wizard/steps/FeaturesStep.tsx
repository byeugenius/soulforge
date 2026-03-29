import { memo } from "react";
import { icon } from "../../../../core/icons.js";
import { useTheme } from "../../../../core/theme/index.js";
import { POPUP_BG, PopupRow } from "../../../layout/shared.js";
import { FEATURES, MODES } from "../data.js";
import { Feat, Gap, SectionLabel, StepHeader } from "../primitives.js";
import { BOLD } from "../theme.js";

export const FeaturesStep = memo(function FeaturesStep({ iw }: { iw: number }) {
  const t = useTheme();
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic={icon("tools")} title="Power Features" />

      {FEATURES.map((group) => (
        <box key={group.section} flexDirection="column" backgroundColor={POPUP_BG}>
          <Gap iw={iw} />
          <SectionLabel iw={iw} label={group.section} />
          {group.items.map((f) => (
            <Feat
              key={f.title}
              iw={iw}
              ic={icon(f.ic)}
              title={f.title}
              keys={f.keys}
              desc={f.desc}
            />
          ))}
        </box>
      ))}

      <Gap iw={iw} />

      <SectionLabel iw={iw} label="Modes" />
      <PopupRow w={iw}>
        <text fg={t.textDim} bg={POPUP_BG}>
          {"  "}
          <span fg={t.warning}>{MODES[0]}</span>
          {` · ${MODES.slice(1).join(" · ")}`}
        </text>
      </PopupRow>
      <PopupRow w={iw}>
        <text fg={t.textDim} bg={POPUP_BG}>
          {"  "}Cycle with{" "}
          <span fg={t.info} attributes={BOLD}>
            Ctrl+D
          </span>{" "}
          or type <span fg={t.brand}>/mode</span>
        </text>
      </PopupRow>
    </>
  );
});
