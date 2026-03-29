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
import { PopupRow, usePopupColors } from "../../../layout/shared.js";
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
  {
    id: "xai-api-key",
    label: "xAI Grok",
    envVar: "XAI_API_KEY",
    url: "https://console.x.ai",
  },
  {
    id: "openrouter-api-key",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai",
  },
];

function hasKey(id: SecretKey): boolean {
  return getSecretSources(id, getDefaultKeyPriority()).active !== "none";
}

function getStatusLabel(id: SecretKey): string {
  const s = getSecretSources(id, getDefaultKeyPriority());
  if (s.active === "none") return "";
  const parts: string[] = [];
  if (s.env) parts.push(s.active === "env" ? "[env]" : "(env)");
  if (s.keychain) parts.push(s.active === "keychain" ? "[keychain]" : "(keychain)");
  if (s.file) parts.push(s.active === "file" ? "[file]" : "(file)");
  return parts.join(" ");
}

type Phase = "provider" | "key";

interface SetupStepProps {
  iw: number;
  hasModel: boolean;
  activeModel: string;
  onSelectModel: () => void;
  active: boolean;
  setActive: (v: boolean) => void;
}

export function SetupStep({ iw, hasModel, activeModel, onSelectModel, setActive }: SetupStepProps) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const renderer = useRenderer();
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>("provider");
  const [inputValue, setInputValue] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderEntry | null>(null);
  const [, setTick] = useState(0);

  const refresh = () => setTick((n) => n + 1);

  // Tell parent we're handling input in key phase
  useEffect(() => {
    setActive(phase === "key");
  }, [phase, setActive]);

  // Reset phase when wizard reopens (visible change remounts, but just in case)
  useEffect(() => {
    setPhase("provider");
    setCursor(0);
    setInputValue("");
    setFlash(null);
    setSelectedProvider(null);
  }, []);

  // Paste handler for key input
  useEffect(() => {
    if (phase !== "key") return;
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
  }, [phase, renderer]);

  useKeyboard((evt) => {
    // Phase: pasting a key
    if (phase === "key") {
      if (evt.name === "escape") {
        setPhase("provider");
        setInputValue("");
        return;
      }
      if (evt.name === "return") {
        if (selectedProvider && inputValue.trim()) {
          const result = setSecret(selectedProvider.id, inputValue.trim());
          if (result.success) {
            setFlash(`✓ ${selectedProvider.label} key saved`);
            setTimeout(() => setFlash(null), 3000);
          }
          refresh();
        }
        setInputValue("");
        setPhase("provider");
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

    // Phase: pick a provider
    if (evt.name === "up") {
      setCursor((c) => (c > 0 ? c - 1 : PROVIDERS.length - 1));
      return;
    }
    if (evt.name === "down") {
      setCursor((c) => (c < PROVIDERS.length - 1 ? c + 1 : 0));
      return;
    }
    if (evt.name === "return") {
      const provider = PROVIDERS[cursor];
      if (!provider) return;
      setSelectedProvider(provider);
      if (hasKey(provider.id)) {
        // Already has key — open model picker directly
        onSelectModel();
      } else {
        setPhase("key");
        setInputValue("");
      }
    }
  });

  const selected = PROVIDERS[cursor];
  const masked =
    inputValue.length > 0
      ? `${"*".repeat(Math.max(0, inputValue.length - 4))}${inputValue.slice(-4)}`
      : "";

  // Phase: entering a key
  if (phase === "key" && selectedProvider) {
    return (
      <>
        <Gap iw={iw} />
        <StepHeader iw={iw} ic="⚿" title={`Set ${selectedProvider.label} Key`} />
        <Gap iw={iw} />

        <PopupRow w={iw}>
          <text fg={t.textSecondary} bg={popupBg}>
            {"  Get your key at "}
          </text>
          <text bg={popupBg}>
            <a href={selectedProvider.url}>
              <span fg={t.info} attributes={TextAttributes.UNDERLINE}>
                {selectedProvider.url.replace("https://", "")}
              </span>
            </a>
          </text>
        </PopupRow>

        <Gap iw={iw} />

        <PopupRow w={iw}>
          <text fg={t.textMuted} bg={popupBg}>
            {"  Paste your key:"}
          </text>
        </PopupRow>

        <PopupRow w={iw}>
          <text bg={popupHl} fg={t.info}>
            {"  "}
            {masked || " "}
          </text>
          <text bg={popupHl} fg={t.brandSecondary}>
            _
          </text>
        </PopupRow>

        <Gap iw={iw} />

        <PopupRow w={iw}>
          <text fg={t.textFaint} bg={popupBg}>
            {"  ⏎ save · esc cancel · "}
            {selectedProvider.envVar}
          </text>
        </PopupRow>
      </>
    );
  }

  // Phase: pick a provider
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="◈" title="Choose a Provider" />
      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={popupBg}>
          {"  Select a provider and press ⏎ to set a key."}
        </text>
      </PopupRow>
      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={popupBg}>
          {"  "}
        </text>
        <text bg={popupBg}>
          <a href="https://llmgateway.io/dashboard">
            <span fg={t.info} attributes={TextAttributes.UNDERLINE}>
              llmgateway.io
            </span>
          </a>
        </text>
        <text fg={t.textSecondary} bg={popupBg}>
          {" gives you one key for all models."}
        </text>
      </PopupRow>

      <Gap iw={iw} />

      {PROVIDERS.map((p, i) => {
        const isSelected = i === cursor;
        const bg = isSelected ? popupHl : popupBg;
        const configured = hasKey(p.id);
        const status = configured ? getStatusLabel(p.id) : "not set";
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
            <text bg={bg} fg={configured ? t.success : t.textFaint}>
              {" "}
              {status}
            </text>
          </PopupRow>
        );
      })}

      {selected && (
        <>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.textFaint} bg={popupBg}>
              {"  "}
              {selected.envVar}
              {"  ·  "}
            </text>
            <text bg={popupBg}>
              <a href={selected.url}>
                <span fg={t.info} attributes={TextAttributes.UNDERLINE}>
                  {selected.url.replace("https://", "")}
                </span>
              </a>
            </text>
          </PopupRow>
        </>
      )}

      {hasModel && (
        <>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.success} attributes={BOLD} bg={popupBg}>
              {"  ✓ "}
            </text>
            <text fg={t.textPrimary} attributes={BOLD} bg={popupBg}>
              {activeModel}
            </text>
          </PopupRow>
        </>
      )}

      {flash && (
        <PopupRow w={iw}>
          <text fg={t.success} attributes={BOLD} bg={popupBg}>
            {"  "}
            {flash}
          </text>
        </PopupRow>
      )}

      <Gap iw={iw} />
      <PopupRow w={iw}>
        <text fg={t.textFaint} bg={popupBg}>
          {"  ↑↓ select · ⏎ set key · → next step"}
        </text>
      </PopupRow>
    </>
  );
}
