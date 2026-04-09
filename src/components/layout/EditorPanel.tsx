import { TextAttributes } from "@opentui/core";
import type { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import { memo, useEffect, useRef, useState } from "react";
import { UI_ICONS } from "../../core/icons.js";
import { type ThemeTokens, useTheme } from "../../core/theme/index.js";

interface Props {
  isOpen: boolean;
  fileName: string | null;
  ptyOnData: (cb: (data: Uint8Array) => void) => () => void;
  nvimCols: number;
  nvimRows: number;
  modeName?: string;
  focused?: boolean;
  cursorLine?: number;
  cursorCol?: number;
  onClosed?: () => void;
  showHints?: boolean;
  error?: string | null;
  split?: number;
}

type Direction = "opening" | "idle";
const ANIMATION_FRAMES = ["  ░", " ░▒", "░▒▓", "▒▓█", "▓██", "███"];

function getModeColors(t: ThemeTokens): Record<string, string> {
  return {
    normal: t.brand,
    insert: t.success,
    visual: t.warning,
    "visual line": t.warning,
    "visual block": t.warning,
    replace: t.brandSecondary,
    command: t.info,
    cmdline_normal: t.info,
    terminal: t.textSecondary,
  };
}

function modeLabel(mode: string): string {
  if (mode.startsWith("cmdline")) return "COMMAND";
  return mode.toUpperCase().replace("_", " ");
}

/** Renders neovim PTY output via ghostty-terminal in persistent mode. */
const NvimTerminal = memo(function NvimTerminal({
  ptyOnData,
  cols,
  rows,
}: {
  ptyOnData: (cb: (data: Uint8Array) => void) => () => void;
  cols: number;
  rows: number;
}) {
  const termRef = useRef<GhosttyTerminalRenderable | null>(null);

  useEffect(() => {
    // Batch PTY chunks that arrive in the same event loop tick into a single
    // feed() call. Without this, neovim's rapid small writes (dozens per frame
    // during scrolling) each trigger a separate requestRender(), causing
    // partial/torn frames and visible artifacts.
    let pending: Uint8Array[] = [];
    let scheduled = false;

    const flush = () => {
      scheduled = false;
      const term = termRef.current;
      if (!term || pending.length === 0) return;
      if (pending.length === 1) {
        term.feed(pending[0] as Uint8Array);
      } else {
        let total = 0;
        for (const chunk of pending) total += chunk.byteLength;
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of pending) {
          combined.set(chunk, offset);
          offset += chunk.byteLength;
        }
        term.feed(combined);
      }
      pending = [];
    };

    return ptyOnData((data) => {
      pending.push(data);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    });
  }, [ptyOnData]);

  useEffect(() => {
    const term = termRef.current;
    if (term) {
      term.cols = cols;
      term.rows = rows;
    }
  }, [cols, rows]);

  return <ghostty-terminal ref={termRef} persistent showCursor cols={cols} rows={rows} />;
});

export const EditorPanel = memo(function EditorPanel({
  isOpen,
  fileName,
  ptyOnData,
  nvimCols,
  nvimRows,
  modeName = "normal",
  focused = false,
  cursorLine,
  cursorCol,
  onClosed,
  showHints = true,
  error,
  split = 60,
}: Props) {
  const t = useTheme();
  const [animFrame, setAnimFrame] = useState(0);
  const [direction, setDirection] = useState<Direction>("idle");
  const prevOpen = useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      prevOpen.current = true;
      setDirection("opening");
      setAnimFrame(0);
    } else if (!isOpen && prevOpen.current) {
      prevOpen.current = false;
      onClosed?.();
    }
  }, [isOpen, onClosed]);

  useEffect(() => {
    if (direction !== "opening") return;
    const interval = setInterval(() => {
      setAnimFrame((prev) => {
        if (prev >= ANIMATION_FRAMES.length - 1) {
          clearInterval(interval);
          setDirection("idle");
          return prev;
        }
        return prev + 1;
      });
    }, 60);
    return () => clearInterval(interval);
  }, [direction]);

  if (!isOpen && direction === "idle") {
    return null;
  }

  const borderColor = focused ? t.borderFocused : t.border;

  if (direction === "opening") {
    return (
      <box
        flexDirection="column"
        width={`${split}%` as `${number}%`}
        borderStyle="rounded"
        border={true}
        borderColor={borderColor}
        alignItems="center"
        justifyContent="center"
      >
        <text fg={t.brand}>{ANIMATION_FRAMES[animFrame]}</text>
        <text fg={t.textDim} attributes={TextAttributes.DIM}>
          loading forge...
        </text>
      </box>
    );
  }

  if (error) {
    return (
      <box
        flexDirection="column"
        width={`${split}%` as `${number}%`}
        borderStyle="rounded"
        border={true}
        borderColor={borderColor}
      >
        <box flexDirection="row" paddingX={1} flexShrink={0} height={1}>
          <text bg={t.brand} fg="white" attributes={TextAttributes.BOLD}>
            {` ${UI_ICONS.editor} `}
          </text>
          <text fg={t.textSecondary}> editor</text>
        </box>
        <box paddingX={1} flexShrink={0} height={1}>
          <text fg={t.textFaint} truncate>
            {"─".repeat(200)}
          </text>
        </box>
        {error === "neovim-not-found" ? (
          <NvimNotFoundSplash />
        ) : (
          <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
            <text fg={t.error} attributes={TextAttributes.BOLD}>
              Editor Failed to Start
            </text>
            <text> </text>
            <text fg={t.textSecondary}>{error}</text>
          </box>
        )}
        <box paddingX={1} flexShrink={0} height={1}>
          <text fg={t.textFaint} truncate>
            {"─".repeat(200)}
          </text>
        </box>
      </box>
    );
  }

  const displayName = fileName
    ? fileName.startsWith(process.cwd())
      ? fileName.slice(process.cwd().length + 1)
      : (fileName.split("/").pop() ?? fileName)
    : "no file";
  const modeColor = getModeColors(t)[modeName] ?? t.brand;

  return (
    <box
      flexDirection="column"
      width={`${split}%` as `${number}%`}
      borderStyle="rounded"
      border={true}
      borderColor={borderColor}
    >
      <box
        flexDirection="row"
        paddingX={1}
        justifyContent="space-between"
        flexShrink={0}
        height={1}
      >
        <box flexDirection="row">
          <text
            bg={focused ? t.borderFocused : t.brand}
            fg="white"
            attributes={TextAttributes.BOLD}
          >
            {` ${UI_ICONS.editor} `}
          </text>
          <text fg={t.textSecondary}> {displayName}</text>
        </box>
        <text>
          <span fg={modeColor}>{"\uE0B6"}</span>
          <span bg={modeColor} fg="white" attributes={TextAttributes.BOLD}>
            {` ${modeLabel(modeName)} `}
          </span>
          <span fg={modeColor}>{"\uE0B4"}</span>
        </text>
      </box>
      <box paddingX={1} flexShrink={0} height={1}>
        <text fg={t.textFaint} truncate>
          {"─".repeat(200)}
        </text>
      </box>

      <box flexDirection="column" flexGrow={1} overflow="hidden">
        <NvimTerminal ptyOnData={ptyOnData} cols={nvimCols} rows={nvimRows} />
      </box>

      <box paddingX={1} flexShrink={0} height={1}>
        <text fg={t.textFaint} truncate>
          {"─".repeat(200)}
        </text>
      </box>
      {showHints && <VimHints mode={modeName} />}
      <box
        flexDirection="row"
        paddingX={1}
        justifyContent="space-between"
        flexShrink={0}
        height={1}
      >
        <text fg={t.textMuted} truncate>
          {fileName ?? ""}
        </text>
        <box flexDirection="row" gap={2}>
          {cursorLine != null && (
            <text fg={t.textSecondary}>
              {String(cursorLine)}:{String((cursorCol ?? 0) + 1)}
            </text>
          )}
          <text fg={t.textMuted} attributes={TextAttributes.BOLD}>
            nvim
          </text>
        </box>
      </box>
    </box>
  );
});

const INSTALL_CMDS: Record<string, { cmd: string; label: string }[]> = {
  darwin: [
    { cmd: "brew install neovim", label: "Homebrew" },
    { cmd: "sudo port install neovim", label: "MacPorts" },
    {
      cmd: "curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-macos-arm64.tar.gz",
      label: "Direct (Apple Silicon)",
    },
    {
      cmd: "curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-macos-x86_64.tar.gz",
      label: "Direct (Intel)",
    },
  ],
  win32: [
    { cmd: "winget install Neovim.Neovim", label: "winget" },
    { cmd: "scoop install neovim", label: "Scoop" },
    { cmd: "choco install neovim", label: "Chocolatey" },
  ],
  linux: [
    {
      cmd: "curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.appimage",
      label: "AppImage (recommended)",
    },
    { cmd: "sudo snap install nvim --classic", label: "Snap" },
    { cmd: "sudo dnf install -y neovim", label: "Fedora" },
    { cmd: "sudo pacman -S neovim", label: "Arch" },
    { cmd: "sudo apt install neovim", label: "Debian / Ubuntu (may be outdated)" },
  ],
};

function NvimNotFoundSplash() {
  const t = useTheme();
  const cmds = INSTALL_CMDS[process.platform] ?? INSTALL_CMDS.linux ?? [];
  const longest = cmds.reduce((max, c) => Math.max(max, c.cmd.length), 0);

  return (
    <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
      <text fg={t.error} attributes={TextAttributes.BOLD}>
        Neovim Not Found
      </text>
      <text> </text>
      <text fg={t.textSecondary}>The editor requires Neovim (v0.11+)</text>
      <text> </text>
      <text fg={t.brand} attributes={TextAttributes.BOLD}>
        Install:
      </text>
      {cmds.map(({ cmd, label }) => (
        <text key={cmd}>
          <span fg={t.textMuted}>{"  $ "}</span>
          <span fg={t.success}>{cmd}</span>
          <span fg={t.textFaint}>
            {" ".repeat(Math.max(2, longest - cmd.length + 2))}
            {label}
          </span>
        </text>
      ))}
      <text> </text>
      <text fg={t.textMuted}>https://github.com/neovim/neovim/releases</text>
      <text> </text>
      <text fg={t.textDim} attributes={TextAttributes.DIM}>
        Restart SoulForge after installing.
      </text>
    </box>
  );
}

function VimHints({ mode }: { mode: string }) {
  const t = useTheme();
  const isInsert = mode === "insert";
  const isVisual = mode.startsWith("visual");

  return (
    <box flexDirection="column" paddingX={1} flexShrink={0}>
      <box flexDirection="row" height={1} gap={2}>
        <H k="i" l="insert" on={isInsert} />
        <H k="Esc" l="normal" on={!isInsert && !isVisual} />
        <H k=":w" l="save" />
        <H k=":q" l="quit" />
        <H k=":wq" l="save & quit" />
        <H k="u" l="undo" />
        <H k="^R" l="redo" />
        <H k="/" l="search" />
        <H k="n" l="next match" />
      </box>
      <box flexDirection="row" height={1} gap={2}>
        <H k="dd" l="del line" />
        <H k="yy" l="copy line" />
        <H k="p" l="paste" />
        <H k="o" l="line below" />
        <H k="v" l="select" on={isVisual} />
        <H k="gg" l="top" />
        <H k="G" l="bottom" />
        <H k="w" l="next word" />
        <text fg={t.textFaint}>/vim-hints to hide</text>
      </box>
    </box>
  );
}

function H({ k, l, on }: { k: string; l: string; on?: boolean }) {
  const t = useTheme();
  return (
    <text>
      <span
        fg={on ? t.success : t.brandSecondary}
        attributes={on ? TextAttributes.BOLD : undefined}
      >
        {k}
      </span>
      <span fg={t.textDim}> {l}</span>
    </text>
  );
}
