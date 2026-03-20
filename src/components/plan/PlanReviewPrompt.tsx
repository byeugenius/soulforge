import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useState } from "react";
import { icon } from "../../core/icons.js";
import type { Plan } from "../../types/index.js";

interface Props {
  onAccept: () => void;
  onClearAndImplement: () => void;
  onRevise: (feedback: string) => void;
  onCancel: () => void;
  isActive: boolean;
  plan: Plan;
  planFile: string;
}

const ACCENT = "#00BFFF";
const STEP_COLOR = "#8B5CF6";
const CANCEL_COLOR = "#FF0040";

interface Option {
  id: string;
  label: string;
  icon: string;
  color: string;
}

const ALL_OPTIONS: Option[] = [
  { id: "implement", label: "Implement", icon: "\u23CE", color: ACCENT },
  { id: "clear_implement", label: "Clear & Implement", icon: "\u21BB", color: "#FF8C00" },
  { id: "revise", label: "Revise", icon: "\uF040", color: STEP_COLOR },
  { id: "cancel", label: "Cancel", icon: "\uF00D", color: CANCEL_COLOR },
];

export function PlanReviewPrompt({
  onAccept,
  onClearAndImplement,
  onRevise,
  onCancel,
  isActive,
  plan,
  planFile,
}: Props) {
  const options = useMemo(() => {
    if (plan.depth === "light") {
      return ALL_OPTIONS.filter((o) => o.id !== "clear_implement");
    }
    return ALL_OPTIONS;
  }, [plan.depth]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [reviseInput, setReviseInput] = useState("");
  const [typing, setTyping] = useState(false);

  useKeyboard((evt) => {
    if (!isActive) return;

    if (typing) {
      if (evt.name === "escape") {
        setTyping(false);
        evt.stopPropagation();
      }
      return;
    }

    if (evt.name === "escape") {
      onCancel();
      evt.stopPropagation();
      return;
    }

    if (evt.name === "up" || evt.name === "left") {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      evt.stopPropagation();
      return;
    }
    if (evt.name === "down" || evt.name === "right" || evt.name === "tab") {
      setSelectedIdx((prev) => (prev + 1) % options.length);
      evt.stopPropagation();
      return;
    }

    if (evt.name === "return") {
      const opt = options[selectedIdx];
      if (!opt) return;
      evt.stopPropagation();
      switch (opt.id) {
        case "implement":
          onAccept();
          break;
        case "clear_implement":
          onClearAndImplement();
          break;
        case "revise":
          setTyping(true);
          setReviseInput("");
          break;
        case "cancel":
          onCancel();
          break;
      }
    }
  });

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor={ACCENT}
      paddingX={1}
      width="100%"
    >
      <box gap={1} flexDirection="row">
        <text fg={ACCENT} attributes={TextAttributes.BOLD}>
          {icon("plan")} {plan.title}
        </text>
        <text fg="#333">{"\u2502"}</text>
        <text fg="#444">{String(plan.steps.length)} steps</text>
        <text fg="#333">{"\u2502"}</text>
        <text fg="#444">{planFile}</text>
      </box>

      {plan.steps.length <= 5 ? (
        <box flexDirection="column">
          {plan.steps.map((step) => (
            <box key={step.id} height={1} flexShrink={0}>
              <text truncate>
                <span fg="#555"> ○ </span>
                <span fg="#999">{step.label}</span>
              </text>
            </box>
          ))}
        </box>
      ) : (
        <box flexDirection="row" width="100%">
          <box flexDirection="column" flexGrow={1} flexBasis={0}>
            {plan.steps.slice(0, Math.ceil(plan.steps.length / 2)).map((step) => (
              <box key={step.id} height={1} flexShrink={0}>
                <text truncate>
                  <span fg="#555"> ○ </span>
                  <span fg="#999">{step.label}</span>
                </text>
              </box>
            ))}
          </box>
          <text fg="#222"> │ </text>
          <box flexDirection="column" flexGrow={1} flexBasis={0}>
            {plan.steps.slice(Math.ceil(plan.steps.length / 2)).map((step) => (
              <box key={step.id} height={1} flexShrink={0}>
                <text truncate>
                  <span fg="#555"> ○ </span>
                  <span fg="#999">{step.label}</span>
                </text>
              </box>
            ))}
          </box>
        </box>
      )}

      <box height={1} flexShrink={0} />

      {typing ? (
        <box flexDirection="row" gap={1}>
          <text fg={STEP_COLOR}>{" \u203A"}</text>
          <input
            value={reviseInput}
            onInput={setReviseInput}
            onSubmit={() => {
              if (reviseInput.trim()) {
                onRevise(reviseInput.trim());
                setReviseInput("");
              }
            }}
            focused={isActive}
            flexGrow={1}
            placeholder="what should change..."
          />
          <text fg="#555">⏎ submit · esc back</text>
        </box>
      ) : (
        <box flexDirection="row" gap={1} height={1}>
          {options.map((opt, i) => {
            const selected = i === selectedIdx;
            return (
              <text key={opt.id}>
                <span
                  fg={selected ? "#111" : "#888"}
                  bg={selected ? opt.color : "#222"}
                  attributes={selected ? TextAttributes.BOLD : undefined}
                >
                  {` ${opt.icon} ${opt.label} `}
                </span>
              </text>
            );
          })}
          <text fg="#333">{"  "}←→ · ⏎ confirm · esc cancel</text>
        </box>
      )}
    </box>
  );
}
