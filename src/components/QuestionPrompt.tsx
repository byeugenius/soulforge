import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { icon } from "../core/icons.js";
import type { PendingQuestion } from "../types/index.js";

interface Props {
  question: PendingQuestion;
  isActive: boolean;
  onAnswer?: (answer: string) => void;
}

const OTHER_IDX = -1;

export function QuestionPrompt({ question, isActive, onAnswer }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const totalOptions = question.options.length + 1;

  useKeyboard((evt) => {
    if (!isActive) return;

    if (typing) {
      if (evt.name === "escape") {
        setTyping(false);
        evt.stopPropagation();
      }
      return;
    }

    if (evt.name === "up") {
      setSelectedIdx((prev) => {
        const cur = prev === OTHER_IDX ? totalOptions - 1 : prev;
        const next = cur > 0 ? cur - 1 : totalOptions - 1;
        return next === totalOptions - 1 ? OTHER_IDX : next;
      });
      evt.stopPropagation();
      return;
    }
    if (evt.name === "down") {
      setSelectedIdx((prev) => {
        const cur = prev === OTHER_IDX ? totalOptions - 1 : prev;
        const next = (cur + 1) % totalOptions;
        return next === totalOptions - 1 ? OTHER_IDX : next;
      });
      evt.stopPropagation();
      return;
    }
    if (evt.name === "return") {
      evt.stopPropagation();
      if (selectedIdx === OTHER_IDX) {
        setTyping(true);
        setInputValue("");
        return;
      }
      const selected = question.options[selectedIdx];
      if (selected) {
        onAnswer?.(selected.label);
        question.resolve(selected.value);
      }
      return;
    }
    if (evt.name === "escape" && question.allowSkip) {
      question.resolve("__skipped__");
      evt.stopPropagation();
    }
  });

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onAnswer?.(trimmed);
      question.resolve(trimmed);
    }
  };

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#FF8C00"
      paddingX={1}
      width="100%"
    >
      <box>
        <text fg="#FF8C00" attributes={TextAttributes.BOLD}>
          {icon("question")} Question
        </text>
      </box>
      <box>
        <text fg="#eee">{question.question}</text>
      </box>
      {question.options.map((opt, i) => {
        const isSelected = !typing && i === selectedIdx;
        return (
          <box key={opt.value} gap={1} flexDirection="row">
            <text fg={isSelected ? "#FF8C00" : "#555"}>{isSelected ? " ›" : "  "}</text>
            <text
              fg={isSelected ? "#FF8C00" : "#ccc"}
              attributes={isSelected ? TextAttributes.BOLD : undefined}
            >
              {opt.label}
            </text>
            {opt.description && <text fg={isSelected ? "#999" : "#555"}>{opt.description}</text>}
          </box>
        );
      })}
      {typing ? (
        <box flexDirection="row" gap={1}>
          <text fg="#FF8C00">{" ›"}</text>
          <input
            value={inputValue}
            onInput={setInputValue}
            onSubmit={handleInputSubmit}
            focused={isActive}
            flexGrow={1}
            placeholder="type your answer..."
          />
        </box>
      ) : (
        <box gap={1} flexDirection="row">
          <text fg={selectedIdx === OTHER_IDX ? "#FF8C00" : "#555"}>
            {selectedIdx === OTHER_IDX ? " ›" : "  "}
          </text>
          <text
            fg={selectedIdx === OTHER_IDX ? "#FF8C00" : "#888"}
            attributes={selectedIdx === OTHER_IDX ? TextAttributes.BOLD : undefined}
          >
            Other (type answer)
          </text>
        </box>
      )}
      <box>
        <text fg="#555">
          {typing
            ? "⏎ submit  esc back"
            : `↑↓ select  ⏎ confirm${question.allowSkip ? "  esc skip" : ""}`}
        </text>
      </box>
    </box>
  );
}
