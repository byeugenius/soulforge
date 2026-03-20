import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { getGitDiff, getGitStatus, gitAdd, gitCommit } from "../../core/git/status.js";
import { icon } from "../../core/icons.js";

import { Overlay, POPUP_BG, POPUP_HL, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 56;

interface Props {
  visible: boolean;
  cwd: string;
  coAuthor: boolean;
  onClose: () => void;
  onCommitted: (msg: string) => void;
  onRefresh: () => void;
}

export function GitCommitModal({ visible, cwd, coAuthor, onClose, onCommitted, onRefresh }: Props) {
  const { width: termCols } = useTerminalDimensions();
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.7));
  const innerW = popupWidth - 2;
  const [message, setMessage] = useState("");
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
  const [untrackedFiles, setUntrackedFiles] = useState<string[]>([]);
  const [diffSummary, setDiffSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stageAll, setStageAll] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMessage("");
    setError(null);
    setStageAll(false);

    Promise.all([getGitStatus(cwd), getGitDiff(cwd, true)])
      .then(([status, diff]) => {
        setStagedFiles(status.staged);
        setModifiedFiles(status.modified);
        setUntrackedFiles(status.untracked);
        const lines = diff.split("\n").length;
        setDiffSummary(lines > 1 ? `${String(lines)} lines changed` : "no staged changes");
      })
      .catch(() => {});
  }, [visible, cwd]);

  const handleCommit = useCallback(async () => {
    if (!message.trim()) {
      setError("Commit message cannot be empty");
      return;
    }

    if (stageAll || stagedFiles.length === 0) {
      const allFiles = [...modifiedFiles, ...untrackedFiles];
      if (allFiles.length > 0) {
        await gitAdd(cwd, allFiles);
      }
    }

    const commitMsg = coAuthor
      ? `${message.trim()}\n\nCo-Authored-By: SoulForge <noreply@soulforge.com>`
      : message.trim();
    const result = await gitCommit(cwd, commitMsg);
    if (result.ok) {
      onCommitted(message.trim());
      onRefresh();
      onClose();
    } else {
      setError(result.output || "Commit failed");
    }
  }, [
    message,
    stageAll,
    stagedFiles,
    modifiedFiles,
    untrackedFiles,
    cwd,
    coAuthor,
    onCommitted,
    onRefresh,
    onClose,
  ]);

  useKeyboard((evt) => {
    if (!visible) return;

    if (evt.name === "escape") {
      onClose();
      return;
    }
    if (evt.name === "tab") {
      setStageAll((prev) => !prev);
      return;
    }
  });

  if (!visible) return null;

  const totalChanges = stagedFiles.length + modifiedFiles.length + untrackedFiles.length;

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor="#FF8C00"
        width={popupWidth}
        backgroundColor={POPUP_BG}
      >
        <PopupRow w={innerW}>
          <text fg="white" attributes={TextAttributes.BOLD} bg={POPUP_BG}>
            {icon("git")} Git Commit
          </text>
        </PopupRow>
        <PopupRow w={innerW}>
          <text fg="#333" bg={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </text>
        </PopupRow>

        {stagedFiles.length > 0 && (
          <PopupRow w={innerW}>
            <text fg="#2d5" bg={POPUP_BG}>
              ● {String(stagedFiles.length)} staged
            </text>
          </PopupRow>
        )}
        {modifiedFiles.length > 0 && (
          <PopupRow w={innerW}>
            <text fg="#FF8C00" bg={POPUP_BG}>
              ● {String(modifiedFiles.length)} modified
            </text>
          </PopupRow>
        )}
        {untrackedFiles.length > 0 && (
          <PopupRow w={innerW}>
            <text fg="#f44" bg={POPUP_BG}>
              ● {String(untrackedFiles.length)} untracked
            </text>
          </PopupRow>
        )}
        {totalChanges === 0 && (
          <PopupRow w={innerW}>
            <text fg="#555" bg={POPUP_BG}>
              No changes to commit
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text fg="#555" bg={POPUP_BG}>
            {diffSummary}
          </text>
        </PopupRow>

        {(modifiedFiles.length > 0 || untrackedFiles.length > 0) && (
          <PopupRow w={innerW} bg={stageAll ? POPUP_HL : POPUP_BG}>
            <text fg={stageAll ? "#FF0040" : "#666"} bg={stageAll ? POPUP_HL : POPUP_BG}>
              [Tab] {stageAll ? "✓" : "○"} Stage all changes
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text fg="#aaa" bg={POPUP_BG}>
            Message:
          </text>
        </PopupRow>
        <box paddingX={2} backgroundColor={POPUP_BG}>
          <box
            borderStyle="rounded"
            border={true}
            borderColor="#6A0DAD"
            paddingX={1}
            width={innerW - 2}
            backgroundColor={POPUP_BG}
          >
            <input
              value={message}
              onInput={setMessage}
              onSubmit={handleCommit}
              placeholder="describe your changes..."
              focused={visible}
              backgroundColor={POPUP_BG}
            />
          </box>
        </box>

        {error && (
          <PopupRow w={innerW}>
            <text fg="#f44" bg={POPUP_BG}>
              {error}
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text>{""}</text>
        </PopupRow>
        <PopupRow w={innerW}>
          <text fg="#555" bg={POPUP_BG}>
            {"⏎"} commit | tab stage-all | esc cancel
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
