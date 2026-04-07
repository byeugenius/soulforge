import { spawn } from "node:child_process";
import { platform } from "node:os";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useState } from "react";
import { icon } from "../../core/icons.js";
import {
  detectInstalledFonts,
  installFont,
  NERD_FONTS,
  type NerdFont,
} from "../../core/setup/install.js";
import {
  checkPrerequisites,
  getInstallCommands,
  type PrerequisiteStatus,
} from "../../core/setup/prerequisites.js";
import { useTheme } from "../../core/theme/index.js";
import { Popup, POPUP_BG, POPUP_HL, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 74;
const CHROME_ROWS = 10;

type Tab = "tools" | "fonts";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSystemMessage: (msg: string) => void;
}

export function SetupGuide({ visible, onClose, onSystemMessage }: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const containerRows = termRows - 2;
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.8));
  const innerW = popupWidth - 2;
  const maxVisible = Math.max(4, Math.floor(containerRows * 0.8) - CHROME_ROWS);
  const t = useTheme();
  const [statuses, setStatuses] = useState<PrerequisiteStatus[]>(() => checkPrerequisites());
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tools");
  const [fontCursor, setFontCursor] = useState(0);
  const [fontScrollOffset, setFontScrollOffset] = useState(0);
  const [installedFonts, setInstalledFonts] = useState<NerdFont[]>(() => detectInstalledFonts());

  const adjustScroll = (next: number) => {
    setScrollOffset((prev) => {
      if (next < prev) return next;
      if (next >= prev + maxVisible) return next - maxVisible + 1;
      return prev;
    });
  };

  const adjustFontScroll = (next: number) => {
    setFontScrollOffset((prev) => {
      if (next < prev) return next;
      if (next >= prev + maxVisible) return next - maxVisible + 1;
      return prev;
    });
  };

  const os = platform();
  const osLabel = os === "darwin" ? "macOS" : os === "win32" ? "Windows" : "Linux";

  const refresh = useCallback(() => {
    setStatuses(checkPrerequisites());
    setInstalledFonts(detectInstalledFonts());
  }, []);

  const installSelected = useCallback(() => {
    const item = statuses[cursor];
    if (!item || item.installed) return;

    const cmds = getInstallCommands(item.prerequisite.name);
    const cmd = cmds.find((c) => !c.startsWith("#") && c.trim().length > 0);
    if (!cmd) {
      onSystemMessage(
        `No auto-install command for ${item.prerequisite.name}. Manual steps:\n${cmds.join("\n")}`,
      );
      return;
    }

    setInstalling(item.prerequisite.name);
    onSystemMessage(`Installing ${item.prerequisite.name}...`);

    const proc = spawn("sh", ["-c", cmd], { stdio: "pipe" });
    const chunks: string[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d.toString()));
    proc.stderr.on("data", (d: Buffer) => chunks.push(d.toString()));
    proc.on("close", (code) => {
      setInstalling(null);
      if (code === 0) {
        onSystemMessage(`${item.prerequisite.name} installed successfully.`);
      } else {
        onSystemMessage(
          `Failed to install ${item.prerequisite.name}:\n${chunks.join("").slice(0, 200)}`,
        );
      }
      refresh();
    });
    proc.on("error", () => {
      setInstalling(null);
      onSystemMessage(`Failed to run install command. Try manually:\n${cmd}`);
    });
  }, [statuses, cursor, onSystemMessage, refresh]);

  const installSelectedFont = useCallback(() => {
    const font = NERD_FONTS[fontCursor];
    if (!font) return;
    const isInstalled = installedFonts.some((f) => f.id === font.id);
    if (isInstalled) return;

    setInstalling(font.name);
    onSystemMessage(`Installing ${font.name} Nerd Font...`);

    installFont(font.id)
      .then((family) => {
        setInstalling(null);
        onSystemMessage(`${font.name} installed! Set terminal font to "${family}"`);
        refresh();
      })
      .catch((err: unknown) => {
        setInstalling(null);
        const msg = err instanceof Error ? err.message : String(err);
        onSystemMessage(`Failed to install ${font.name}: ${msg}`);
      });
  }, [fontCursor, installedFonts, onSystemMessage, refresh]);

  useKeyboard((evt) => {
    if (!visible) return;
    if (installing) return;

    if (evt.name === "escape") {
      onClose();
      return;
    }

    if (evt.name === "tab" || evt.name === "1" || evt.name === "2") {
      if (evt.name === "tab") {
        setTab((t) => (t === "tools" ? "fonts" : "tools"));
      } else if (evt.name === "1") {
        setTab("tools");
      } else {
        setTab("fonts");
      }
      return;
    }

    if (tab === "tools") {
      if (evt.name === "up" || evt.name === "k") {
        setCursor((p) => {
          const next = p > 0 ? p - 1 : statuses.length - 1;
          adjustScroll(next);
          return next;
        });
        return;
      }
      if (evt.name === "down" || evt.name === "j") {
        setCursor((p) => {
          const next = p < statuses.length - 1 ? p + 1 : 0;
          adjustScroll(next);
          return next;
        });
        return;
      }
      if (evt.name === "return" || evt.name === "i") {
        installSelected();
        return;
      }
      if (evt.name === "r") {
        refresh();
        return;
      }
      if (evt.name === "a") {
        const missing = statuses.filter((s) => !s.installed);
        if (missing.length === 0) return;
        const cmds: string[] = [];
        for (const s of missing) {
          const c = getInstallCommands(s.prerequisite.name).find(
            (l) => !l.startsWith("#") && l.trim().length > 0,
          );
          if (c) cmds.push(c);
        }
        if (cmds.length === 0) return;
        setInstalling("all");
        onSystemMessage(`Installing ${String(cmds.length)} prerequisites...`);
        const fullCmd = cmds.join(" && ");
        const proc = spawn("sh", ["-c", fullCmd], { stdio: "pipe" });
        proc.on("close", (code) => {
          setInstalling(null);
          onSystemMessage(
            code === 0
              ? "All prerequisites installed!"
              : "Some installs may have failed. Run /setup to check.",
          );
          refresh();
        });
        proc.on("error", () => {
          setInstalling(null);
          onSystemMessage("Failed to run install commands.");
        });
      }
    } else {
      if (evt.name === "up" || evt.name === "k") {
        setFontCursor((p) => {
          const next = p > 0 ? p - 1 : NERD_FONTS.length - 1;
          adjustFontScroll(next);
          return next;
        });
        return;
      }
      if (evt.name === "down" || evt.name === "j") {
        setFontCursor((p) => {
          const next = p < NERD_FONTS.length - 1 ? p + 1 : 0;
          adjustFontScroll(next);
          return next;
        });
        return;
      }
      if (evt.name === "return" || evt.name === "i") {
        installSelectedFont();
        return;
      }
      if (evt.name === "r") {
        refresh();
      }
    }
  });

  if (!visible) return null;

  const allInstalled = statuses.every((s) => s.installed);
  const missingCount = statuses.filter((s) => !s.installed).length;

  const footerHints = [
    { key: "⏎", label: "install" },
    ...(tab === "tools" ? [{ key: "a", label: "install all" }] : []),
    { key: "r", label: "refresh" },
    { key: "tab", label: "switch" },
    { key: "esc", label: "close" },
  ];

  return (
    <Popup
      width={popupWidth}
      title="SoulForge Setup"
      icon={icon("ghost")}
      headerRight={
        <text fg={t.textMuted} bg={POPUP_BG}>
          {"  "}
          {osLabel}
        </text>
      }
      footer={footerHints}
    >
      <PopupRow w={innerW}>
        <text
          fg={tab === "tools" ? t.brand : t.textMuted}
          attributes={tab === "tools" ? TextAttributes.BOLD : undefined}
          bg={POPUP_BG}
        >
          [1] Tools
        </text>
        <text fg={t.textFaint} bg={POPUP_BG}>
          {"  "}
        </text>
        <text
          fg={tab === "fonts" ? t.brand : t.textMuted}
          attributes={tab === "fonts" ? TextAttributes.BOLD : undefined}
          bg={POPUP_BG}
        >
          [2] Fonts
        </text>
      </PopupRow>

      <PopupRow w={innerW}>
        <text fg={t.textFaint} bg={POPUP_BG}>
          {"─".repeat(innerW - 4)}
        </text>
      </PopupRow>

      {tab === "tools" ? (
        <>
          {allInstalled ? (
            <PopupRow w={innerW}>
              <text fg={t.success} bg={POPUP_BG}>
                ✓ All prerequisites are installed!
              </text>
            </PopupRow>
          ) : (
            <PopupRow w={innerW}>
              <text fg={t.warning} bg={POPUP_BG}>
                {String(missingCount)} missing — select to install
              </text>
            </PopupRow>
          )}

          <PopupRow w={innerW}>
            <text>{""}</text>
          </PopupRow>

          <box
            flexDirection="column"
            height={Math.min(statuses.length || 1, maxVisible)}
            overflow="hidden"
          >
            {statuses.slice(scrollOffset, scrollOffset + maxVisible).map((s, vi) => {
              const i = vi + scrollOffset;
              const isActive = i === cursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const icon = s.installed ? "✓" : s.prerequisite.required ? "✗" : "○";
              const iconColor = s.installed
                ? t.success
                : s.prerequisite.required
                  ? t.error
                  : t.warning;
              const nameColor = s.installed
                ? t.textMuted
                : isActive
                  ? t.brandSecondary
                  : t.textSecondary;

              return (
                <PopupRow key={s.prerequisite.name} bg={bg} w={innerW}>
                  <text bg={bg} fg={isActive ? t.brandSecondary : t.textFaint}>
                    {isActive ? "› " : "  "}
                  </text>
                  <text bg={bg} fg={iconColor}>
                    {icon}{" "}
                  </text>
                  <text
                    bg={bg}
                    fg={nameColor}
                    attributes={isActive && !s.installed ? TextAttributes.BOLD : undefined}
                  >
                    {s.prerequisite.name.padEnd(28)}
                  </text>
                  <text bg={bg} fg={s.installed ? t.textFaint : t.textMuted}>
                    {s.installed ? "installed" : s.prerequisite.required ? "required" : "optional"}
                  </text>
                </PopupRow>
              );
            })}
          </box>
          {statuses.length > maxVisible && (
            <PopupRow w={innerW}>
              <text fg={t.textMuted} bg={POPUP_BG}>
                {scrollOffset > 0 ? "↑ " : "  "}
                {String(cursor + 1)}/{String(statuses.length)}
                {scrollOffset + maxVisible < statuses.length ? " ↓" : ""}
              </text>
            </PopupRow>
          )}
        </>
      ) : (
        <>
          <PopupRow w={innerW}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              Select a Nerd Font to install:
            </text>
          </PopupRow>

          <PopupRow w={innerW}>
            <text>{""}</text>
          </PopupRow>

          <box
            flexDirection="column"
            height={Math.min(NERD_FONTS.length || 1, maxVisible)}
            overflow="hidden"
          >
            {NERD_FONTS.slice(fontScrollOffset, fontScrollOffset + maxVisible).map((font, vi) => {
              const i = vi + fontScrollOffset;
              const isActive = i === fontCursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const isInstalled = installedFonts.some((f) => f.id === font.id);
              const icon = isInstalled ? "✓" : "○";
              const iconColor = isInstalled ? t.success : t.warning;
              const nameColor = isInstalled
                ? t.textMuted
                : isActive
                  ? t.brandSecondary
                  : t.textSecondary;

              return (
                <PopupRow key={font.id} bg={bg} w={innerW}>
                  <text bg={bg} fg={isActive ? t.brandSecondary : t.textFaint}>
                    {isActive ? "› " : "  "}
                  </text>
                  <text bg={bg} fg={iconColor}>
                    {icon}{" "}
                  </text>
                  <text
                    bg={bg}
                    fg={nameColor}
                    attributes={isActive && !isInstalled ? TextAttributes.BOLD : undefined}
                  >
                    {font.name.padEnd(20)}
                  </text>
                  <text bg={bg} fg={isInstalled ? t.textFaint : t.textMuted}>
                    {isInstalled ? "installed" : font.description.slice(0, 26)}
                  </text>
                </PopupRow>
              );
            })}
          </box>
          {NERD_FONTS.length > maxVisible && (
            <PopupRow w={innerW}>
              <text fg={t.textMuted} bg={POPUP_BG}>
                {fontScrollOffset > 0 ? "↑ " : "  "}
                {String(fontCursor + 1)}/{String(NERD_FONTS.length)}
                {fontScrollOffset + maxVisible < NERD_FONTS.length ? " ↓" : ""}
              </text>
            </PopupRow>
          )}

          <PopupRow w={innerW}>
            <text>{""}</text>
          </PopupRow>

          <PopupRow w={innerW}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              After install, set terminal font to the name shown
            </text>
          </PopupRow>
        </>
      )}

      <PopupRow w={innerW}>
        <text>{""}</text>
      </PopupRow>

      {installing && (
        <PopupRow w={innerW}>
          <text fg={t.brand} bg={POPUP_BG}>
            ⠹ Installing {installing}...
          </text>
        </PopupRow>
      )}
    </Popup>
  );
}
