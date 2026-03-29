import { memo } from "react";
import { useTheme } from "../../../../core/theme/index.js";
import { PopupRow, usePopupColors } from "../../../layout/shared.js";
import { PAD, PROVIDERS } from "../data.js";
import { Gap, Hr, StepHeader } from "../primitives.js";
import { BOLD, ITALIC } from "../theme.js";

export const ModelStep = memo(function ModelStep({
  iw,
  hasModel,
  activeModel,
}: {
  iw: number;
  hasModel: boolean;
  activeModel: string;
}) {
  const t = useTheme();
  const { bg } = usePopupColors();
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="◈" title="Choose a Provider & Model" />
      <Gap iw={iw} />
      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={bg}>
          {"  SoulForge supports multiple AI providers:"}
        </text>
      </PopupRow>
      <Gap iw={iw} />
      {PROVIDERS.map((p) => (
        <PopupRow key={p.name} w={iw}>
          <text fg={p.highlight ? t.brand : t.info} attributes={BOLD} bg={bg}>
            {"    "}
            {p.highlight ? "★ " : "  "}
            {p.name.padEnd(PAD)}
          </text>
          <text fg={p.highlight ? t.textPrimary : t.textSecondary} bg={bg}>
            {p.desc}
          </text>
        </PopupRow>
      ))}
      <Gap iw={iw} />
      <Hr iw={iw} />
      <Gap iw={iw} />
      {hasModel ? (
        <PopupRow w={iw}>
          <text fg={t.success} attributes={BOLD} bg={bg}>
            {"  ✓ Active model: "}
          </text>
          <text fg={t.textPrimary} attributes={BOLD} bg={bg}>
            {activeModel}
          </text>
        </PopupRow>
      ) : (
        <>
          <PopupRow w={iw}>
            <text fg={t.warning} attributes={BOLD} bg={bg}>
              {"  ⏎ Press Enter to open the model picker"}
            </text>
          </PopupRow>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.textMuted} attributes={ITALIC} bg={bg}>
              {"  You can also use Ctrl+L anytime to switch models."}
            </text>
          </PopupRow>
        </>
      )}
    </>
  );
});
