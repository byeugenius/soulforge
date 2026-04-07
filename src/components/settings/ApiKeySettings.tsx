import { decodePasteBytes, type PasteEvent, TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { saveGlobalConfig } from "../../config/index.js";
import { icon, providerIcon } from "../../core/icons.js";
import { getAllProviders } from "../../core/llm/providers/index.js";
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
import {
  Overlay,
  POPUP_BG,
  POPUP_HL,
  PopupFooterHints,
  PopupRow,
  usePopupColors,
} from "../layout/shared.js";

const MAX_POPUP_WIDTH = 76;
const CHROME_ROWS = 10;
const INPUT_FIELD_WIDTH = 44;

interface KeyItem {
  id: SecretKey;
  label: string;
  envVar: string;
  url?: string;
  providerId: string;
  grouped: boolean;
}

function buildKeyItems(): KeyItem[] {
  return getAllProviders()
    .filter((p): p is typeof p & { secretKey: string } => !!(p.envVar && p.secretKey))
    .map((p) => ({
      id: p.secretKey as SecretKey,
      label: p.name,
      envVar: p.envVar,
      url: p.keyUrl,
      providerId: p.id,
      grouped: !!p.grouped,
    }));
}

interface ApiKeyState {
  keys: Record<string, SecretSources>;
  priority: KeyPriority;
  refresh: (items: KeyItem[]) => void;
}

function refreshKeys(items: KeyItem[], priority: KeyPriority): Record<string, SecretSources> {
  return Object.fromEntries(items.map((k) => [k.id, getSecretSources(k.id, priority)]));
}

const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  keys: {},
  priority: getDefaultKeyPriority(),
  refresh: (items: KeyItem[]) => set({ keys: refreshKeys(items, get().priority) }),
}));

type MenuItem =
  | { type: "key"; item: KeyItem; sources: SecretSources }
  | { type: "remove"; label: string; keyId: SecretKey }
  | { type: "section"; label: string }
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

function SectionRow({ label, iw }: { label: string; iw: number }) {
  const t = useTheme();
  const pad = iw - 4 - label.length;
  return (
    <PopupRow w={iw}>
      <text bg={POPUP_BG} fg={t.textFaint}>
        {"─ "}
      </text>
      <text bg={POPUP_BG} fg={t.textSecondary} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      <text bg={POPUP_BG} fg={t.textFaint}>
        {" "}
        {"─".repeat(Math.max(0, pad))}
      </text>
    </PopupRow>
  );
}

function ProviderKeyRow({
  item,
  sources,
  isSelected,
  bg,
}: {
  item: KeyItem;
  sources: SecretSources;
  isSelected: boolean;
  bg: string;
}) {
  const t = useTheme();
  const badges = formatBadges(sources);
  const hasAny = sources.active !== "none";
  const pIcon = providerIcon(item.providerId);

  return (
    <>
      <text bg={bg} fg={isSelected ? t.brand : t.textDim}>
        {isSelected ? " › " : "   "}
      </text>
      <text bg={bg} fg={isSelected ? t.brandAlt : t.textFaint}>
        {pIcon}
        {"  "}
      </text>
      <text
        bg={bg}
        fg={isSelected ? "white" : t.textPrimary}
        attributes={isSelected ? TextAttributes.BOLD : 0}
      >
        {item.label}
      </text>
      <text bg={bg} fg={hasAny ? t.success : t.textDim}>
        {"  "}
        {badges}
      </text>
    </>
  );
}

function RemoveKeyRow({
  label,
  isSelected,
  bg,
}: {
  label: string;
  isSelected: boolean;
  bg: string;
}) {
  const t = useTheme();
  return (
    <>
      <text bg={bg} fg={isSelected ? t.brand : t.textDim}>
        {isSelected ? " ›" : "  "}
        {"     "}
      </text>
      <text bg={bg} fg={isSelected ? t.brandSecondary : t.textMuted}>
        {label}
      </text>
    </>
  );
}

function PriorityRow({
  isSelected,
  bg,
  priority,
  priorityLabel,
  innerW,
}: {
  isSelected: boolean;
  bg: string;
  priority: KeyPriority;
  priorityLabel: string;
  innerW: number;
}) {
  const t = useTheme();
  return (
    <PopupRow w={innerW}>
      <text bg={bg} fg={isSelected ? t.brand : t.textDim}>
        {isSelected ? " › " : "   "}
      </text>
      <text bg={bg} fg={isSelected ? "white" : t.textSecondary}>
        {"Resolution  "}
      </text>
      <text bg={bg} fg={priority === "app" ? t.warning : t.info} attributes={TextAttributes.BOLD}>
        {priorityLabel}
      </text>
    </PopupRow>
  );
}

export function ApiKeySettings({ visible, onClose }: Props) {
  const renderer = useRenderer();
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.max(56, Math.floor(termCols * 0.85)));
  const innerW = popupWidth - 2;
  const maxVisible = Math.max(6, Math.floor((termRows - 2) * 0.85) - CHROME_ROWS);

  const t = useTheme();
  usePopupColors();
  const keyItems = useMemo(() => buildKeyItems(), []);
  const keys = useApiKeyStore((s) => s.keys);
  const priority = useApiKeyStore((s) => s.priority);
  const refresh = useApiKeyStore((s) => s.refresh);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<"menu" | "input">("menu");
  const [inputValue, setInputValue] = useState("");
  const [inputTarget, setInputTarget] = useState<SecretKey | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(
    null,
  );
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (visible) {
      useApiKeyStore.setState({ priority: getDefaultKeyPriority() });
      refresh(keyItems);
      setCursor(0);
      setScrollOffset(0);
      setMode("menu");
      setStatusMsg(null);
    }
  }, [visible, refresh, keyItems]);

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

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [];
    const direct = keyItems.filter((k) => !k.grouped);
    const gateways = keyItems.filter((k) => k.grouped);

    if (direct.length > 0) {
      items.push({ type: "section", label: "Providers" });
      for (const k of direct) {
        const sources = keys[k.id];
        if (!sources) continue;
        items.push({ type: "key", item: k, sources });
        if (sources.keychain || sources.file) {
          items.push({ type: "remove", label: `Remove ${k.label}`, keyId: k.id });
        }
      }
    }

    if (gateways.length > 0) {
      items.push({ type: "section", label: "Gateways" });
      for (const k of gateways) {
        const sources = keys[k.id];
        if (!sources) continue;
        items.push({ type: "key", item: k, sources });
        if (sources.keychain || sources.file) {
          items.push({ type: "remove", label: `Remove ${k.label}`, keyId: k.id });
        }
      }
    }

    items.push({ type: "section", label: "Settings" });
    items.push({ type: "priority" });
    return items;
  }, [keyItems, keys]);

  const selectableItems = useMemo(
    () => menuItems.map((mi, i) => ({ mi, i })).filter(({ mi }) => mi.type !== "section"),
    [menuItems],
  );

  const flash = (msg: string, type: "success" | "error") => {
    setStatusMsg({ text: msg, type });
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
    refresh(keyItems);
    saveGlobalConfig({ keyPriority: next });
    flash(`Priority: ${next === "env" ? "env vars first" : "app keys first"}`, "success");
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
      flash(`Saved to ${where}`, "success");
    } else {
      flash("Failed to save key", "error");
    }
    refresh(keyItems);
    setMode("menu");
    setInputValue("");
    setInputTarget(null);
  };

  const handleRemoveKey = (keyId: SecretKey) => {
    const result = deleteSecret(keyId);
    if (result.success) {
      flash(`Removed from ${result.storage}`, "success");
    } else {
      flash("Key not found", "error");
    }
    refresh(keyItems);
  };

  const clampedCursor = Math.min(cursor, Math.max(0, selectableItems.length - 1));
  const selectedAbsIdx = selectableItems[clampedCursor]?.i ?? 0;
  const effectiveScrollOffset = Math.min(scrollOffset, Math.max(0, menuItems.length - maxVisible));
  const visibleItems = menuItems.slice(effectiveScrollOffset, effectiveScrollOffset + maxVisible);

  const handleKeyboard = (evt: import("@opentui/core").KeyEvent) => {
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
      const next = clampedCursor > 0 ? clampedCursor - 1 : selectableItems.length - 1;
      setCursor(next);
      const absIdx = selectableItems[next]?.i ?? 0;
      if (absIdx < effectiveScrollOffset) setScrollOffset(absIdx > 0 ? absIdx - 1 : 0);
      return;
    }
    if (evt.name === "down") {
      const next = clampedCursor < selectableItems.length - 1 ? clampedCursor + 1 : 0;
      setCursor(next);
      const absIdx = selectableItems[next]?.i ?? 0;
      if (absIdx >= effectiveScrollOffset + maxVisible) {
        setScrollOffset(absIdx - maxVisible + 1);
      }
      return;
    }
    if (evt.name === "return" || evt.name === " ") {
      const entry = selectableItems[clampedCursor];
      if (!entry) return;
      const item = entry.mi;
      if (item.type === "priority") {
        handleTogglePriority();
      } else if (item.type === "key") {
        handleSetKey(item.item.id);
      } else if (item.type === "remove") {
        handleRemoveKey(item.keyId);
      }
    }
  };

  useKeyboard(handleKeyboard);

  if (!visible) return null;

  const backend = getStorageBackend();
  const backendLabel = backend === "keychain" ? "OS Keychain" : "~/.soulforge/secrets.json";
  const configuredCount = keyItems.filter((k) => keys[k.id]?.active !== "none").length;
  const priorityLabel = priority === "env" ? "env vars first" : "app keys first";

  if (mode === "input") {
    const target = keyItems.find((k) => k.id === inputTarget);
    const existingSources = inputTarget ? keys[inputTarget] : undefined;
    const masked =
      inputValue.length > 0
        ? `${"*".repeat(Math.max(0, inputValue.length - 4))}${inputValue.slice(-4)}`
        : "";
    const displayField =
      masked.length > INPUT_FIELD_WIDTH
        ? masked.slice(masked.length - INPUT_FIELD_WIDTH)
        : masked.padEnd(INPUT_FIELD_WIDTH);

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
              {icon("key")}
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
              {displayField}
            </text>
            <text bg={t.bgPopupHighlight} fg={t.brand}>
              {"▎"}
            </text>
          </PopupRow>

          <Hr iw={innerW} />

          <PopupFooterHints
            w={innerW}
            hints={[
              { key: "⏎", label: "save" },
              { key: "esc", label: "cancel" },
            ]}
          />
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
        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.brand} attributes={TextAttributes.BOLD}>
            {icon("key")}
          </text>
          <text bg={POPUP_BG} fg={t.textPrimary} attributes={TextAttributes.BOLD}>
            {" API Keys"}
          </text>
          <text bg={POPUP_BG} fg={t.textMuted}>
            {"  "}
            {String(configuredCount)}/{String(keyItems.length)} configured
          </text>
          <text bg={POPUP_BG} fg={t.textFaint}>
            {"  "}
            {backendLabel}
          </text>
        </PopupRow>

        <Hr iw={innerW} />

        {visibleItems.map((mi, idx) => {
          const absoluteIdx = effectiveScrollOffset + idx;
          const isSelected = absoluteIdx === selectedAbsIdx;
          const bg = isSelected ? POPUP_HL : POPUP_BG;

          if (mi.type === "section") {
            return <SectionRow key={`s-${mi.label}`} label={mi.label} iw={innerW} />;
          }

          if (mi.type === "priority") {
            return (
              <PriorityRow
                key="priority"
                isSelected={isSelected}
                bg={bg}
                priority={priority}
                priorityLabel={priorityLabel}
                innerW={innerW}
              />
            );
          }

          if (mi.type === "remove") {
            return (
              <PopupRow key={`rm-${mi.keyId}`} w={innerW}>
                <RemoveKeyRow label={mi.label} isSelected={isSelected} bg={bg} />
              </PopupRow>
            );
          }

          return (
            <PopupRow key={mi.item.id} w={innerW}>
              <ProviderKeyRow item={mi.item} sources={mi.sources} isSelected={isSelected} bg={bg} />
            </PopupRow>
          );
        })}

        {(() => {
          const entry = selectableItems[clampedCursor];
          if (!entry) return null;
          const selected = entry.mi;
          if (selected.type === "key" && selected.item.url) {
            return (
              <>
                <Hr iw={innerW} />
                <PopupRow w={innerW}>
                  <text bg={POPUP_BG} fg={t.info}>
                    {"   "}
                    {selected.item.url}
                  </text>
                  <text bg={POPUP_BG} fg={t.textFaint}>
                    {"  "}
                    {selected.item.envVar}
                  </text>
                </PopupRow>
              </>
            );
          }
          if (selected.type === "priority") {
            return (
              <>
                <Hr iw={innerW} />
                <PopupRow w={innerW}>
                  <text bg={POPUP_BG} fg={t.textDim}>
                    {"   "}
                    {priority === "env"
                      ? "env vars override app keys"
                      : "app keys override env vars"}
                  </text>
                </PopupRow>
              </>
            );
          }
          return null;
        })()}

        {statusMsg && (
          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={statusMsg.type === "success" ? t.success : t.error}>
              {" "}
              {statusMsg.text}
            </text>
          </PopupRow>
        )}

        <Hr iw={innerW} />

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg={t.textMuted}>
            {"<↑↓> navigate · <⏎> select · <esc> close"}
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
