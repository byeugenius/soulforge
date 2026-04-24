import { memo } from "react";
import { icon } from "../../../../core/icons.js";
import { MODE_ITEMS } from "../data.js";
import { FeatureList } from "../primitives.js";

export const ModesStep = memo(function ModesStep() {
  return (
    <FeatureList
      heading="Modes — how Forge approaches work"
      headerIcon={icon("plan")}
      intro="Cycle with Ctrl+D. Auto runs hands-free. Plan is research-only. Architect/Socratic/Challenge are read-only design passes."
      items={MODE_ITEMS.map((x) => ({ ...x, ic: icon(x.ic) }))}
    />
  );
});
