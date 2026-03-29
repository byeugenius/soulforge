import { decodePasteBytes, type PasteEvent, TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { saveGlobalConfig } from "../../config/index.js";
import { icon } from "../../core/icons.js";
import {
  deleteSecret,
  getDefaultKeyPriority,
  getSecretSources,
  getStorageBackend,
  type KeyPriority,
  type SecretKey,
  type SecretSources,
  setDefaultKeyPriority,
  setSecret,
} from "../../core/secrets.js";
import { useTheme } from "../../core/theme/index.js";
import { Overlay, POPUP_BG, POPUP_HL, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 68;
const CHROME_ROWS = 12;

interface ApiKeyState {
  keys: Partial<Record<SecretKey, SecretSources>>;
  priority: KeyPriority;
  refresh: () => void;
}

const PROVIDER_KEYS: SecretKey[] = [
  "llmgateway-api-key",
  "anthropic-api-key",
  "openai-api-key",
  "google-api-key",
  "xai-api-key",
  "openrouter-api-key",
  "vercel-gateway-api-key",
];

function refreshKeys(priority: KeyPriority) {
  return Object.fromEntries(PROVIDER_KEYS.map((k) => [k, getSecretSources(k, priority)]));
}

const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  keys: refreshKeys(getDefaultKeyPriority()),
  priority: getDefaultKeyPriority(),
  refresh: () => set({ keys: refreshKeys(get().priority) }),
}));

interface KeyItem {
  id: SecretKey;
  label: string;
  envVar: string;
  url?: string;
}

const KEY_ITEMS: KeyItem[] = [
  {
    id: "llmgateway-api-key",
    label: "LLM Gateway",
    envVar: "LLM_GATEWAY_API_KEY",
    url: "llmgateway.io/dashboard",
  },
  {
    id: "anthropic-api-key",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    url: "console.anthropic.com",
  },
  {
    id: "openai-api-key",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    url: "platform.openai.com",
  },
  {
    id: "google-api-key",
    label: "Google Gemini",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    url: "aistudio.google.com",
  },
  {
    id: "xai-api-key",
    label: "xAI Grok",
    envVar: "XAI_API_KEY",
    url: "console.x.ai",
  },
  {
    id: "openrouter-api-key",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    url: "openrouter.ai",
  },
  {
    id: "vercel-gateway-api-key",
    label: "Vercel AI Gateway",
    envVar: "AI_GATEWAY_API_KEY",
    url: "vercel.com/ai-gateway",
  },
];

type MenuItem =
  | { type: "key"; item: KeyItem; sources: SecretSources }
  | { type: "remove"; label: string; keyId: SecretKey }
  | { type: "priority" };

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatBadges(sources: SecretSources): string {
  const parts: string[] = [];
  const tag = (label: string, isActive: boolean) => (isActive ? `[${label}]` : `(${label})`);
  if (sources.env) parts.push(tag("env", sources.active === "env"));
  if (sources.keychain) parts.push(tag("keychain", sources.active === "keychain"));
  if (sources.file) parts.push(tag("file", sources.active === "file"));
  if (parts.length === 0) return "not set";
  return parts.join(" ");
}

function Hr({ iw }: { iw: number }) {
  const t = useTheme();
  return (
    <PopupRow w={iw}>
      <text bg={POPUP_BG} fg={t.textFaint}>
        {"─".repeat(iw - 2)}
      </text>
    </PopupRow>
  );
}

export function ApiKeySettings({ visible, onClose }: Props) {
  const renderer = useRenderer();
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.8));
  const innerW = popupWidth - 2;
  const maxVisible = Math.max(4, Math.floor((termRows - 2) * 0.8) - CHROME_ROWS);

  const t = useTheme();
  const keys = useApiKeyStore((s) => s.keys);
  const priority = useApiKeyStore((s) => s.priority);
  const refresh = useApiKeyStore((s) => s.refresh);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<"menu" | "input">("menu");
  const [inputValue, setInputValue] = useState("");
  const [inputTarget, setInputTarget] = useState<SecretKey | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (visible) {
      useApiKeyStore.setState({ priority: getDefaultKeyPriority() });
      refresh();
      setCursor(0);
      setScrollOffset(0);
      setMode("menu");
      setStatusMsg(null);
    }
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible || mode !== "input") return;
    const handler = (event: PasteEvent) => {
      const cleaned = decodePasteBytes(event.bytes)
        .replace(/[\n\r]/g, "")
        .trim();
      if (cleaned) setInputValue((v) => v + cleaned);
    };
    renderer.keyInput.on("paste", handler);
    return () => {
      renderer.keyInput.off("paste", handler);
    };
  }, [visible, mode, renderer]);

  const menuItems: MenuItem[] = [];
  for (const k of KEY_ITEMS) {
    const sources = keys[k.id];
    if (!sources) continue;
    menuItems.push({ type: "key", item: k, sources });
    if (sources.keychain || sources.file) {
      menuItems.push({ type: "remove", label: `Remove ${k.label}`, keyId: k.id });
    }
  }
  menuItems.push({ type: "priority" });

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleSetKey = (target: SecretKey) => {
    setInputTarget(target);
    setInputValue("");
    setMode("input");
  };

  const handleTogglePriority = () => {
    const next: KeyPriority = priority === "env" ? "app" : "env";
    setDefaultKeyPriority(next);
    useApiKeyStore.setState({ priority: next });
    refresh();
    saveGlobalConfig({ keyPriority: next });
    flash(`Priority: ${next === "env" ? "env vars first" : "app keys first"}`);
  };

  const handleConfirmInput = () => {
    if (!inputTarget || !inputValue.trim()) {
      setMode("menu");
      return;
    }
    const result = setSecret(inputTarget, inputValue.trim());
    if (result.success) {
      const where =
        result.storage === "keychain"
          ? "OS keychain"
          : (result.path ?? "~/.soulforge/secrets.json");
      flash(`Saved to ${where}`);
    } else {
      flash("Failed to save key");
    }
    refresh();
    setMode("menu");
    setInputValue("");
    setInputTarget(null);
  };

  const handleRemoveKey = (keyId: SecretKey) => {
    const result = deleteSecret(keyId);
    if (result.success) {
      flash(`Removed from ${result.storage}`);
    } else {
      flash("Key not found");
    }
    refresh();
  };

  const clampedCursor = Math.min(cursor, Math.max(0, menuItems.length - 1));
  const effectiveScrollOffset = Math.min(scrollOffset, Math.max(0, menuItems.length - maxVisible));
  const visibleItems = menuItems.slice(effectiveScrollOffset, effectiveScrollOffset + maxVisible);

  useKeyboard((evt) => {
    if (!visible) return;

    if (mode === "input") {
      if (evt.name === "escape") {
        setMode("menu");
        setInputValue("");
        setInputTarget(null);
        return;
      }
      if (evt.name === "return") {
        handleConfirmInput();
        return;
      }
      if (evt.name === "backspace") {
        setInputValue((v) => v.slice(0, -1));
        return;
      }
      if (evt.sequence && evt.sequence.length === 1 && !evt.ctrl && !evt.meta) {
        setInputValue((v) => v + evt.sequence);
      }
      return;
    }

    if (evt.name === "escape") {
      onClose();
      return;
    }
    if (evt.name === "up") {
      const next = clampedCursor > 0 ? clampedCursor - 1 : menuItems.length - 1;
      setCursor(next);
      if (next < effectiveScrollOffset) setScrollOffset(next);
      return;
    }
    if (evt.name === "down") {
      const next = clampedCursor < menuItems.length - 1 ? clampedCursor + 1 : 0;
      setCursor(next);
      if (next >= effectiveScrollOffset + maxVisible) {
        setScrollOffset(next - maxVisible + 1);
      }
      return;
    }
    if (evt.name === "return" || evt.name === " ") {
      const item = menuItems[clampedCursor];
      if (!item) return;
      if (item.type === "priority") {
        handleTogglePriority();
      } else if (item.type === "key") {
        handleSetKey(item.item.id);
      } else if (item.type === "remove") {
        handleRemoveKey(item.keyId);
      }
    }
  });

  if (!visible) return null;

  const backend = getStorageBackend();
  const backendLabel = backend === "keychain" ? "OS Keychain" : "~/.soulforge/secrets.json";
  const configuredCount = KEY_ITEMS.filter((k) => keys[k.id]?.active !== "none").length;
  const priorityLabel = priority === "env" ? "env vars first" : "app keys first";

  if (mode === "input") {
    const target = KEY_ITEMS.find((k) => k.id === inputTarget);
    const existingSources = inputTarget ? keys[inputTarget] : undefined;
    const masked =
      inputValue.length > 0
        ? `${"*".repeat(Math.max(0, inputValue.length - 4))}${inputValue.slice(-4)}`
        : "";

    return (
      <Overlay>
        <box
          flexDirection="column"
          borderStyle="rounded"
          border={true}
          borderColor={t.brandAlt}
          width={popupWidth}
        >
          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={t.brand} attributes={TextAttributes.BOLD}>
              {icon("key") ?? ""}
            </text>
            <text bg={POPUP_BG} fg={t.textPrimary} attributes={TextAttributes.BOLD}>
              {" "}
              {target?.label ?? "API Key"}
            </text>
            {target?.url && (
              <text bg={POPUP_BG} fg={t.textDim}>
                {`  ${target.url}`}
              </text>
            )}
          </PopupRow>

          <Hr iw={innerW} />

          {existingSources?.env && (
            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={t.warning}>
                env var already set — this adds an app key
                {priority === "app" ? " (takes priority)" : " (env takes priority)"}
              </text>
            </PopupRow>
          )}

          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={t.textSecondary}>
              Paste your key:
            </text>
          </PopupRow>

          <PopupRow w={innerW}>
            <text bg={t.bgPopupHighlight} fg={t.brandAlt}>
              {masked || " "}
            </text>
            <text bg={t.bgPopupHighlight} fg={t.brandSecondary}>
              _
            </text>
          </PopupRow>

          <Hr iw={innerW} />

          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={t.textMuted}>
              {"⏎"} save · esc cancel · {backendLabel}
            </text>
          </PopupRow>
        </box>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor={t.brandAlt}
        width={popupWidth}
      >
        {/* Header */}
        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.brand} attributes={TextAttributes.BOLD}>
            {icon("key") ?? ""}
          </text>
          <text bg={POPUP_BG} fg={t.textPrimary} attributes={TextAttributes.BOLD}>
            {" API Keys"}
          </text>
          <text bg={POPUP_BG} fg={t.textMuted}>
            {"  "}
            {String(configuredCount)}/{String(KEY_ITEMS.length)} configured
          </text>
        </PopupRow>

        <Hr iw={innerW} />

        {/* Provider list + priority */}
        {visibleItems.map((mi, idx) => {
          const absoluteIdx = effectiveScrollOffset + idx;
          const isSelected = absoluteIdx === clampedCursor;
          const bg = isSelected ? POPUP_HL : POPUP_BG;

          // Separator before priority
          if (mi.type === "priority") {
            return (
              <box key="priority-group" flexDirection="column">
                <PopupRow w={innerW}>
                  <text bg={POPUP_BG} fg={t.textFaint}>
                    {"─".repeat(innerW - 2)}
                  </text>
                </PopupRow>
                <PopupRow w={innerW}>
                  <text bg={bg} fg={isSelected ? "white" : t.textSecondary}>
                    {isSelected ? "› " : "  "}
                    {"Resolution  "}
                  </text>
                  <text
                    bg={bg}
                    fg={priority === "app" ? t.warning : t.info}
                    attributes={TextAttributes.BOLD}
                  >
                    {priorityLabel}
                  </text>
                </PopupRow>
              </box>
            );
          }

          if (mi.type === "remove") {
            return (
              <PopupRow key={`rm-${mi.keyId}`} w={innerW}>
                <text bg={bg} fg={isSelected ? t.brandSecondary : t.textMuted}>
                  {isSelected ? "›" : " "}
                  {"     "}
                  {mi.label}
                </text>
              </PopupRow>
            );
          }

          const sources = mi.sources;
          const item = mi.item;
          const badges = formatBadges(sources);
          const hasAny = sources.active !== "none";

          return (
            <PopupRow key={item.id} w={innerW}>
              <text bg={bg} fg={isSelected ? "white" : t.textPrimary}>
                {isSelected ? "› " : "  "}
                {item.label}
              </text>
              <text bg={bg} fg={hasAny ? t.success : t.textDim}>
                {" "}
                {badges}
              </text>
            </PopupRow>
          );
        })}

        {/* Detail for selected provider */}
        {(() => {
          const selected = menuItems[clampedCursor];
          if (selected?.type === "key" && selected.item.url) {
            return (
              <PopupRow w={innerW}>
                <text bg={POPUP_BG} fg={t.info}>
                  {"    "}
                  {selected.item.url}
                </text>
                <text bg={POPUP_BG} fg={t.textFaint}>
                  {"  "}
                  {selected.item.envVar}
                </text>
              </PopupRow>
            );
          }
          if (selected?.type === "priority") {
            return (
              <PopupRow w={innerW}>
                <text bg={POPUP_BG} fg={t.textDim}>
                  {"    "}
                  {priority === "env" ? "env vars override app keys" : "app keys override env vars"}
                </text>
              </PopupRow>
            );
          }
          return null;
        })()}

        {statusMsg && (
          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={t.warning}>
              {" "}
              {statusMsg}
            </text>
          </PopupRow>
        )}

        {/* Footer */}
        <Hr iw={innerW} />

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.textMuted}>
            ↑↓ navigate · ⏎ set/toggle · esc close
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.textMuted}>
            [active] (available) · {backendLabel}
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
