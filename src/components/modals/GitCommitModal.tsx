import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { getGitDiff, getGitStatus, gitAdd, gitCommit } from "../../core/git/status.js";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import { Overlay, POPUP_BG, POPUP_HL, PopupFooterHints, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 64;

interface Props {
  visible: boolean;
  cwd: string;
  coAuthor: boolean;
  onClose: () => void;
  onCommitted: (msg: string) => void;
  onRefresh: () => void;
}

export function GitCommitModal({ visible, cwd, coAuthor, onClose, onCommitted, onRefresh }: Props) {
  const t = useTheme();
  const { width: termCols } = useTerminalDimensions();
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.8));
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
        borderColor={t.warning}
        width={popupWidth}
        backgroundColor={POPUP_BG}
      >
        <PopupRow w={innerW}>
          <text fg={t.brand} attributes={TextAttributes.BOLD} bg={POPUP_BG}>
            {icon("git")}{" "}
          </text>
          <text fg={t.textPrimary} attributes={TextAttributes.BOLD} bg={POPUP_BG}>
            Git Commit
          </text>
        </PopupRow>
        <PopupRow w={innerW}>
          <text fg={t.textFaint} bg={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </text>
        </PopupRow>

        {stagedFiles.length > 0 && (
          <PopupRow w={innerW}>
            <text fg={t.success} bg={POPUP_BG}>
              ● {String(stagedFiles.length)} staged
            </text>
          </PopupRow>
        )}
        {modifiedFiles.length > 0 && (
          <PopupRow w={innerW}>
            <text fg={t.warning} bg={POPUP_BG}>
              ● {String(modifiedFiles.length)} modified
            </text>
          </PopupRow>
        )}
        {untrackedFiles.length > 0 && (
          <PopupRow w={innerW}>
            <text fg={t.error} bg={POPUP_BG}>
              ● {String(untrackedFiles.length)} untracked
            </text>
          </PopupRow>
        )}
        {totalChanges === 0 && (
          <PopupRow w={innerW}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              No changes to commit
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text fg={t.textMuted} bg={POPUP_BG}>
            {diffSummary}
          </text>
        </PopupRow>

        {(modifiedFiles.length > 0 || untrackedFiles.length > 0) && (
          <PopupRow w={innerW} bg={stageAll ? POPUP_HL : POPUP_BG}>
            <text
              fg={stageAll ? t.brandSecondary : t.textMuted}
              bg={stageAll ? POPUP_HL : POPUP_BG}
            >
              [Tab] {stageAll ? "✓" : "○"} Stage all changes
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text fg={t.textSecondary} bg={POPUP_BG}>
            Message:
          </text>
        </PopupRow>
        <box paddingX={2} backgroundColor={POPUP_BG}>
          <box
            borderStyle="rounded"
            border={true}
            borderColor={t.brandDim}
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
            <text fg={t.error} bg={POPUP_BG}>
              {error}
            </text>
          </PopupRow>
        )}

        <PopupFooterHints
          w={innerW}
          hints={[
            { key: "⏎", label: "commit" },
            { key: "tab", label: "stage-all" },
            { key: "esc", label: "cancel" },
          ]}
        />
      </box>
    </Overlay>
  );
}
