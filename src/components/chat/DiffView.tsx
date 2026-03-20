import { readFileSync } from "node:fs";
import { memo, useMemo } from "react";
import { computeDiff, langFromPath } from "../../core/diff.js";
import { getSyntaxStyle, getTSClient } from "../../core/utils/syntax.js";

const HEADER_ACCENT = "#9B30FF";
const BORDER_COLOR = "#333";
const HEADER_PATH = "#ccc";
const ERROR_COLOR = "#f44";
const LARGE_DIFF_THRESHOLD = 50;

const ADD_COLOR = "#4a7";
const REMOVE_COLOR = "#a55";
const COLLAPSED_COLOR = "#555";

type DiffMode = "default" | "sidebyside" | "compact";

interface Props {
  filePath: string;
  oldString: string;
  newString: string;
  success: boolean;
  errorMessage?: string;
  mode?: DiffMode;
}

function toUnifiedDiff(filePath: string, oldStr: string, newStr: string): string {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${String(oldLines.length)} +1,${String(newLines.length)} @@`,
  ];
  const body: string[] = [];
  const maxOld = oldLines.length;
  const maxNew = newLines.length;

  let oi = 0;
  let ni = 0;
  while (oi < maxOld && ni < maxNew) {
    if (oldLines[oi] === newLines[ni]) {
      body.push(` ${oldLines[oi]}`);
      oi++;
      ni++;
    } else {
      body.push(`-${oldLines[oi]}`);
      oi++;
    }
  }
  while (ni < maxNew) {
    body.push(`+${newLines[ni]}`);
    ni++;
  }
  while (oi < maxOld) {
    body.push(`-${oldLines[oi]}`);
    oi++;
  }

  return [...header, ...body].join("\n");
}

const DIFF_COLORS = {
  addedBg: "#0a1a0f",
  removedBg: "#1a0a0a",
  contextBg: "transparent",
  addedContentBg: "#0a1a0f",
  removedContentBg: "#1a0a0a",
  contextContentBg: "transparent",
  addedLineNumberBg: "#0a1a0f",
  removedLineNumberBg: "#1a0a0a",
  addedSignColor: ADD_COLOR,
  removedSignColor: "#644",
} as const;

export const DiffView = memo(function DiffView({
  filePath,
  oldString,
  newString,
  success,
  errorMessage,
  mode = "default",
}: Props) {
  const startLine = useMemo(() => {
    try {
      const content = readFileSync(filePath, "utf-8");
      const idx = content.indexOf(newString);
      if (idx >= 0) return content.slice(0, idx).split("\n").length;
      const idx2 = content.indexOf(oldString);
      if (idx2 >= 0) return content.slice(0, idx2).split("\n").length;
    } catch {}
    return 1;
  }, [filePath, oldString, newString]);

  const computed = useMemo(() => {
    if (!success) return null;
    return computeDiff(oldString, newString, startLine);
  }, [oldString, newString, success, startLine]);

  const lang = useMemo(() => langFromPath(filePath), [filePath]);
  const isLarge = computed != null && computed.added + computed.removed > LARGE_DIFF_THRESHOLD;

  const verb = !success ? "Edit" : computed?.isCreation ? "New" : "Edit";
  const icon = !success ? "✗" : "✎";
  const iconColor = !success ? ERROR_COLOR : HEADER_ACCENT;

  const unifiedDiff = useMemo(() => {
    if (!success || !computed || isLarge) return null;
    return toUnifiedDiff(filePath, oldString, newString);
  }, [success, computed, isLarge, filePath, oldString, newString]);

  const viewMode = mode === "sidebyside" ? "split" : "unified";

  if (mode === "compact") {
    return (
      <box minHeight={1} flexShrink={0}>
        <text truncate>
          <span fg={iconColor}>{icon} </span>
          <span fg={HEADER_PATH}>{filePath}</span>
          {!success ? (
            <span fg={ERROR_COLOR}> {errorMessage ?? "failed"}</span>
          ) : computed ? (
            <>
              {computed.added > 0 ? <span fg={ADD_COLOR}> +{String(computed.added)}</span> : null}
              {computed.removed > 0 ? (
                <span fg={REMOVE_COLOR}> -{String(computed.removed)}</span>
              ) : null}
            </>
          ) : null}
        </text>
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={BORDER_COLOR}
    >
      <box
        height={1}
        flexShrink={0}
        paddingX={1}
        backgroundColor="#1a1a1a"
        alignSelf="flex-start"
        marginTop={-1}
      >
        <text truncate>
          <span fg={iconColor}>{icon}</span> <span fg={HEADER_ACCENT}>{verb}</span>
          <span fg={BORDER_COLOR}> ─ </span>
          <span fg={HEADER_PATH}>{filePath}</span>
          {success && computed ? (
            <>
              {computed.added > 0 ? <span fg={ADD_COLOR}> +{String(computed.added)}</span> : null}
              {computed.removed > 0 ? (
                <span fg={REMOVE_COLOR}> -{String(computed.removed)}</span>
              ) : null}
            </>
          ) : null}
        </text>
      </box>
      {!success ? (
        <box paddingX={1}>
          <text fg={ERROR_COLOR}>{errorMessage ?? "old_string not found in file"}</text>
        </box>
      ) : isLarge ? (
        <box paddingX={1}>
          <text fg={COLLAPSED_COLOR}>
            {String(computed.added + computed.removed)} lines changed
          </text>
        </box>
      ) : unifiedDiff ? (
        <diff
          diff={unifiedDiff}
          view={viewMode}
          filetype={lang}
          syntaxStyle={getSyntaxStyle()}
          treeSitterClient={getTSClient()}
          showLineNumbers
          {...DIFF_COLORS}
        />
      ) : null}
    </box>
  );
});
