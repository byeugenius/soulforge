import { TextAttributes } from "@opentui/core";
import { useEffect, useMemo, useState } from "react";
import { icon } from "../../core/icons.js";
import type { Tab, TabActivity } from "../../hooks/useTabs.js";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  getActivity: (id: string) => TabActivity;
}

function truncateLabel(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function TabBar({ tabs, activeTabId, onSwitch: _onSwitch, getActivity }: TabBarProps) {
  const [spinFrame, setSpinFrame] = useState(0);

  // Cache all activities once per render — avoids double getActivity calls
  const activities = useMemo(
    () => new Map(tabs.map((t) => [t.id, getActivity(t.id)])),
    [tabs, getActivity],
  );

  const hasLoading = useMemo(
    () => tabs.some((t) => t.id !== activeTabId && activities.get(t.id)?.isLoading),
    [tabs, activeTabId, activities],
  );

  useEffect(() => {
    if (!hasLoading) return;
    const timer = setInterval(() => setSpinFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, [hasLoading]);

  return (
    <box flexShrink={0} paddingX={1} height={1} flexDirection="row" gap={1}>
      <text fg="#333">{icon("tabs")}</text>
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId;
        const label = truncateLabel(tab.label, 20);
        const num = String(i + 1);
        const activity = activities.get(tab.id);

        let indicator = "";
        let indicatorColor = "";
        if (activity?.isLoading) {
          indicator = `${SPINNER_FRAMES[spinFrame] ?? "⠋"} `;
          indicatorColor = "#8B5CF6";
        } else if (activity?.hasUnread) {
          indicator = "● ";
          indicatorColor = "#b87333";
        } else if (activity?.hasError) {
          indicator = "● ";
          indicatorColor = "#a55";
        }

        return (
          <box key={tab.id} flexDirection="row">
            {i > 0 && <text fg="#222">·</text>}
            {indicator !== "" && <text fg={indicatorColor}>{indicator}</text>}
            <text
              fg={isActive ? "#ccc" : "#555"}
              attributes={isActive ? TextAttributes.BOLD : undefined}
            >
              <span fg={isActive ? "#666" : "#333"}>{num}</span> {label}
            </text>
          </box>
        );
      })}
    </box>
  );
}
