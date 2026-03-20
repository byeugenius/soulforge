import { TextAttributes } from "@opentui/core";
import { memo, useEffect, useRef, useState } from "react";
import type { ScreenSegment } from "../../core/editor/screen.js";
import { UI_ICONS } from "../../core/icons.js";

interface Props {
  isOpen: boolean;
  fileName: string | null;
  screenLines: ScreenSegment[][];
  defaultBg?: string;
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

const MODE_COLORS: Record<string, string> = {
  normal: "#6A0DAD",
  insert: "#00AA00",
  visual: "#FF8C00",
  "visual line": "#FF8C00",
  "visual block": "#FF8C00",
  replace: "#FF0040",
  command: "#4488FF",
  cmdline_normal: "#4488FF",
  terminal: "#888888",
};

function modeLabel(mode: string): string {
  if (mode.startsWith("cmdline")) return "COMMAND";
  return mode.toUpperCase().replace("_", " ");
}

const ScreenRow = memo(function ScreenRow({
  segments,
  bg,
}: {
  segments: ScreenSegment[];
  bg: string | undefined;
}) {
  return (
    <box flexDirection="row">
      {segments.map((seg, j) => {
        let attrs = 0;
        if (seg.bold) attrs |= TextAttributes.BOLD;
        if (seg.italic) attrs |= TextAttributes.ITALIC;
        if (seg.underline) attrs |= TextAttributes.UNDERLINE;
        if (seg.strikethrough) attrs |= TextAttributes.STRIKETHROUGH;
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
            key={j}
            fg={seg.fg}
            bg={seg.bg ?? bg}
            attributes={attrs || undefined}
          >
            {seg.text}
          </text>
        );
      })}
    </box>
  );
});

export const EditorPanel = memo(function EditorPanel({
  isOpen,
  fileName,
  screenLines,
  defaultBg,
  modeName = "normal",
  focused = false,
  cursorLine,
  cursorCol,
  onClosed,
  showHints = true,
  error,
  split = 60,
}: Props) {
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

  const borderColor = focused ? "#FF0040" : "#333";

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
        <text fg="#9B30FF">{ANIMATION_FRAMES[animFrame]}</text>
        <text fg="#444" attributes={TextAttributes.DIM}>
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
          <text bg="#6A0DAD" fg="white" attributes={TextAttributes.BOLD}>
            {` ${UI_ICONS.editor} `}
          </text>
          <text fg="#888"> editor</text>
        </box>
        <box paddingX={1} flexShrink={0} height={1}>
          <text fg="#333" truncate>
            {"─".repeat(200)}
          </text>
        </box>
        {error === "neovim-not-found" ? (
          <NvimNotFoundSplash />
        ) : (
          <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#FF0040" attributes={TextAttributes.BOLD}>
              Editor Failed to Start
            </text>
            <text> </text>
            <text fg="#666">{error}</text>
          </box>
        )}
        <box paddingX={1} flexShrink={0} height={1}>
          <text fg="#333" truncate>
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
  const bg = defaultBg;
  const modeColor = MODE_COLORS[modeName] ?? "#6A0DAD";

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
          <text bg={focused ? "#FF0040" : "#6A0DAD"} fg="white" attributes={TextAttributes.BOLD}>
            {` ${UI_ICONS.editor} `}
          </text>
          <text fg="#888"> {displayName}</text>
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
        <text fg="#333" truncate>
          {"─".repeat(200)}
        </text>
      </box>

      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {screenLines.length === 0 ? (
          <box justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg="#333">waiting for nvim...</text>
          </box>
        ) : (
          screenLines.map((segments, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable screen rows
            <ScreenRow key={row} segments={segments} bg={bg} />
          ))
        )}
      </box>

      <box paddingX={1} flexShrink={0} height={1}>
        <text fg="#333" truncate>
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
        <text fg="#555" truncate>
          {fileName ?? ""}
        </text>
        <box flexDirection="row" gap={2}>
          {cursorLine != null && (
            <text fg="#666">
              {String(cursorLine)}:{String((cursorCol ?? 0) + 1)}
            </text>
          )}
          <text fg="#555" attributes={TextAttributes.BOLD}>
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
  const cmds = INSTALL_CMDS[process.platform] ?? INSTALL_CMDS.linux ?? [];
  const longest = cmds.reduce((max, c) => Math.max(max, c.cmd.length), 0);

  return (
    <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
      <text fg="#FF0040" attributes={TextAttributes.BOLD}>
        Neovim Not Found
      </text>
      <text> </text>
      <text fg="#666">The editor requires Neovim (v0.11+)</text>
      <text> </text>
      <text fg="#6A0DAD" attributes={TextAttributes.BOLD}>
        Install:
      </text>
      {cmds.map(({ cmd, label }) => (
        <text key={cmd}>
          <span fg="#555">{"  $ "}</span>
          <span fg="#00AA00">{cmd}</span>
          <span fg="#333">
            {" ".repeat(Math.max(2, longest - cmd.length + 2))}
            {label}
          </span>
        </text>
      ))}
      <text> </text>
      <text fg="#555">https://github.com/neovim/neovim/releases</text>
      <text> </text>
      <text fg="#444" attributes={TextAttributes.DIM}>
        Restart SoulForge after installing.
      </text>
    </box>
  );
}

function VimHints({ mode }: { mode: string }) {
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
        <text fg="#333">/vim-hints to hide</text>
      </box>
    </box>
  );
}

function H({ k, l, on }: { k: string; l: string; on?: boolean }) {
  return (
    <text>
      <span fg={on ? "#00AA00" : "#FF0040"} attributes={on ? TextAttributes.BOLD : undefined}>
        {k}
      </span>
      <span fg="#444"> {l}</span>
    </text>
  );
}
