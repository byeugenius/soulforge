import { decodePasteBytes, type PasteEvent, TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useEffect, useState } from "react";
import {
  getDefaultKeyPriority,
  getSecretSources,
  type SecretKey,
  setSecret,
} from "../../../../core/secrets.js";
import { useTheme } from "../../../../core/theme/index.js";
import { POPUP_BG, POPUP_HL, PopupRow } from "../../../layout/shared.js";
import { Gap, StepHeader } from "../primitives.js";
import { BOLD } from "../theme.js";

interface ProviderEntry {
  id: SecretKey;
  label: string;
  envVar: string;
  url: string;
}

const PROVIDERS: ProviderEntry[] = [
  {
    id: "llmgateway-api-key",
    label: "LLM Gateway",
    envVar: "LLM_GATEWAY_API_KEY",
    url: "https://llmgateway.io/dashboard",
  },
  {
    id: "anthropic-api-key",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    url: "https://console.anthropic.com",
  },
  {
    id: "openai-api-key",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    url: "https://platform.openai.com",
  },
  {
    id: "google-api-key",
    label: "Google Gemini",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    url: "https://aistudio.google.com",
  },
  { id: "xai-api-key", label: "xAI Grok", envVar: "XAI_API_KEY", url: "https://console.x.ai" },
  {
    id: "openrouter-api-key",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai",
  },
];

function getStatus(id: SecretKey): string {
  const s = getSecretSources(id, getDefaultKeyPriority());
  if (s.active === "none") return "not set";
  const parts: string[] = [];
  if (s.env) parts.push(s.active === "env" ? "[env]" : "(env)");
  if (s.keychain) parts.push(s.active === "keychain" ? "[keychain]" : "(keychain)");
  if (s.file) parts.push(s.active === "file" ? "[file]" : "(file)");
  return parts.join(" ");
}

interface KeysStepProps {
  iw: number;
  inputMode: boolean;
  setInputMode: (v: boolean) => void;
}

export function KeysStep({ iw, inputMode, setInputMode }: KeysStepProps) {
  const t = useTheme();
  const renderer = useRenderer();
  const [cursor, setCursor] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<string[]>(() => PROVIDERS.map((p) => getStatus(p.id)));

  const refreshStatuses = () => setStatuses(PROVIDERS.map((p) => getStatus(p.id)));

  // Paste handler
  useEffect(() => {
    if (!inputMode) return;
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
  }, [inputMode, renderer]);

  useKeyboard((evt) => {
    if (inputMode) {
      if (evt.name === "escape") {
        setInputMode(false);
        setInputValue("");
        return;
      }
      if (evt.name === "return") {
        const provider = PROVIDERS[cursor];
        if (provider && inputValue.trim()) {
          const result = setSecret(provider.id, inputValue.trim());
          if (result.success) {
            setFlash(`${provider.label} key saved`);
            setTimeout(() => setFlash(null), 3000);
          }
        }
        setInputMode(false);
        setInputValue("");
        refreshStatuses();
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

    if (evt.name === "up") {
      setCursor((c) => (c > 0 ? c - 1 : PROVIDERS.length - 1));
      return;
    }
    if (evt.name === "down") {
      setCursor((c) => (c < PROVIDERS.length - 1 ? c + 1 : 0));
      return;
    }
    if (evt.name === "return") {
      setInputMode(true);
      setInputValue("");
    }
  });

  const selected = PROVIDERS[cursor];
  const masked =
    inputValue.length > 0
      ? `${"*".repeat(Math.max(0, inputValue.length - 4))}${inputValue.slice(-4)}`
      : "";

  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="⚿" title="API Keys" />
      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={POPUP_BG}>
          Get a key from{" "}
        </text>
        <text bg={POPUP_BG}>
          <a href="https://llmgateway.io/dashboard">
            <span fg={t.info} attributes={TextAttributes.UNDERLINE}>
              llmgateway.io
            </span>
          </a>
        </text>
        <text fg={t.textSecondary} bg={POPUP_BG}>
          {" "}
          for all models with one key, or set keys below.
        </text>
      </PopupRow>

      <Gap iw={iw} />

      {PROVIDERS.map((p, i) => {
        const isSelected = i === cursor;
        const bg = isSelected ? POPUP_HL : POPUP_BG;
        const status = statuses[i] ?? "not set";
        const hasKey = status !== "not set";
        const isGateway = i === 0;

        return (
          <PopupRow key={p.id} w={iw}>
            <text
              bg={bg}
              fg={isSelected ? t.textPrimary : t.textSecondary}
              attributes={isGateway ? BOLD : 0}
            >
              {isSelected ? "› " : "  "}
              {p.label}
            </text>
            <text bg={bg} fg={hasKey ? t.success : t.textFaint}>
              {" "}
              {status}
            </text>
          </PopupRow>
        );
      })}

      {inputMode && selected ? (
        <>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              Paste {selected.label} key:
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={POPUP_HL} fg={t.info}>
              {"  "}
              {masked || " "}
            </text>
            <text bg={POPUP_HL} fg={t.brandSecondary}>
              _
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text fg={t.textFaint} bg={POPUP_BG}>
              ⏎ save · esc cancel · {selected.envVar}
            </text>
          </PopupRow>
        </>
      ) : selected ? (
        <>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.textFaint} bg={POPUP_BG}>
              {"  "}
              {selected.envVar}
              {"  ·  "}
            </text>
            <text bg={POPUP_BG}>
              <a href={selected.url}>
                <span fg={t.info} attributes={TextAttributes.UNDERLINE}>
                  {selected.url.replace("https://", "")}
                </span>
              </a>
            </text>
          </PopupRow>
        </>
      ) : null}

      {flash && (
        <>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.success} attributes={BOLD} bg={POPUP_BG}>
              {"  ✓ "}
              {flash}
            </text>
          </PopupRow>
        </>
      )}

      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textFaint} bg={POPUP_BG}>
          ↑↓ select · ⏎ set key · → next step · esc skip
        </text>
      </PopupRow>
    </>
  );
}
