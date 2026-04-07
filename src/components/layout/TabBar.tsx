import { TextAttributes } from "@opentui/core";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import { getModeColor, getModeLabel } from "../../hooks/useForgeMode.js";
import type { Tab, TabActivity } from "../../hooks/useTabs.js";
import type { ForgeMode } from "../../types/index.js";
import { SPINNER_FRAMES, useSpinnerFrame } from "./shared.js";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  getActivity: (id: string) => TabActivity;
  getMode: (id: string) => ForgeMode;
  getModelLabel: (id: string) => string | null;
}

function truncateLabel(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function TabBar({
  tabs,
  activeTabId,
  onSwitch: _onSwitch,
  getActivity,
  getMode,
  getModelLabel,
}: TabBarProps) {
  const spinFrame = useSpinnerFrame();

  const activities = new Map(tabs.map((t) => [t.id, getActivity(t.id)]));

  const t = useTheme();

  return (
    <box flexShrink={0} paddingX={1} height={1} flexDirection="row">
      <text fg={t.textDim}>{icon("tabs")} </text>
      <text fg={t.textMuted} attributes={TextAttributes.BOLD}>
        TABS{" "}
      </text>
      <text fg={t.textFaint}>→ </text>
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId;
        const num = String(i + 1);
        const activity = activities.get(tab.id);
        const isDefaultLabel = /^Tab \d+$/.test(tab.label);
        const label = isDefaultLabel ? " New tab" : ` ${truncateLabel(tab.label, 20)}`;
        const tabMode = getMode(tab.id);
        const tabModeLabel = getModeLabel(tabMode);
        const tabModeColor = getModeColor(tabMode);

        const isLoading = activity?.isLoading ?? false;
        const isCompacting = activity?.isCompacting ?? false;
        const hasError = activity?.hasError ?? false;
        const hasUnread = activity?.hasUnread ?? false;
        const needsAttention = activity?.needsAttention ?? false;

        const bracketColor = needsAttention
          ? t.warning
          : isCompacting
            ? t.info
            : isLoading
              ? t.brandAlt
              : hasError
                ? t.error
                : isActive
                  ? t.borderFocused
                  : t.textDim;

        const numColor = isActive
          ? t.borderFocused
          : needsAttention
            ? t.warning
            : isCompacting
              ? t.info
              : isLoading
                ? t.brandAlt
                : t.textSecondary;
        const labelColor = isActive ? t.textPrimary : hasUnread ? t.amber : t.textMuted;

        return (
          <box key={tab.id} flexDirection="row">
            {i > 0 && <text fg={t.textSubtle}> │ </text>}
            {needsAttention && !isActive && <text fg={t.warning}>? </text>}
            {isCompacting && !needsAttention && (
              <text fg={t.info}>{SPINNER_FRAMES[spinFrame] ?? "⠋"} </text>
            )}
            {isLoading && !isCompacting && !needsAttention && (
              <text fg={t.brandAlt}>{SPINNER_FRAMES[spinFrame] ?? "⠋"} </text>
            )}
            <text fg={bracketColor}>[</text>
            <text fg={numColor} attributes={isActive ? TextAttributes.BOLD : undefined}>
              {num}
            </text>
            <text fg={bracketColor}>]</text>
            {tabMode !== "default" && (
              <>
                <text fg={isActive ? tabModeColor : t.textMuted}>[</text>
                <text fg={tabModeColor} attributes={isActive ? TextAttributes.BOLD : undefined}>
                  {tabModeLabel}
                </text>
                <text fg={isActive ? tabModeColor : t.textMuted}>]</text>
              </>
            )}
            {(activity?.editedFileCount ?? 0) > 0 && (
              <>
                <text fg={isActive ? t.success : t.textDim}>[</text>
                <text fg={t.success}>
                  {icon("pencil")} {String(activity?.editedFileCount ?? 0)}
                </text>
                <text fg={isActive ? t.success : t.textDim}>]</text>
              </>
            )}
            {(() => {
              const modelLabel = getModelLabel(tab.id);
              if (!modelLabel) return null;
              const c = isActive ? t.textSecondary : t.textDim;
              return (
                <>
                  <text fg={c}> [</text>
                  <text fg={isActive ? t.textSecondary : t.textMuted}>
                    {truncateLabel(modelLabel, 16)}
                  </text>
                  <text fg={c}>]</text>
                </>
              );
            })()}
            {label && (
              <text fg={labelColor} attributes={isActive ? TextAttributes.BOLD : undefined}>
                {label}
              </text>
            )}
            {hasUnread && !isLoading && !needsAttention && <text fg={t.amber}>[●]</text>}
            {hasError && !isLoading && !needsAttention && <text fg={t.error}>[✗]</text>}
          </box>
        );
      })}
    </box>
  );
}
