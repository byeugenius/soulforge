import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import { icon } from "../../core/icons.js";
import { getShortModelLabel } from "../../core/llm/models.js";
import type { ProviderStatus } from "../../core/llm/provider.js";
import type { PrerequisiteStatus } from "../../core/setup/prerequisites.js";
import { useTheme } from "../../core/theme/index.js";
import { garble, WISP_FRAMES, WORDMARK } from "../../core/utils/splash.js";
import { useRepoMapStore } from "../../stores/repomap.js";
import { ScanDivider } from "./ScanDivider.js";
import { SPINNER_FRAMES, useSpinnerFrame } from "./shared.js";

const BOLD = TextAttributes.BOLD;
const ITALIC = TextAttributes.ITALIC;
const DIM = TextAttributes.DIM;

const GHOST_FADE = ["░", "▒", "▓"];

/* ── Forge quips — one picked randomly per mount ── */
const IDLE_QUIPS = [
  "The forge awaits your command.",
  "The anvil is warm. What shall we build?",
  "The runes are aligned. Speak your intent.",
  "All spirits present and accounted for.",
  "The blade is sharp. The code is ready.",
  "Another day, another codebase to conquer.",
  "The ether hums with potential.",
  "Your codebase has been mapped. The forge sees all.",
  "The scrolls are indexed. Ask anything.",
  "Ready to transmute code into gold.",
  "The ghost remembers your last session.",
  "Forge hot. Tools sharp. Let's ship.",
];

/* ── Time-of-day greetings ── */
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "The forge burns at midnight.";
  if (h < 12) return "Morning forge session. Coffee recommended.";
  if (h < 17) return "Afternoon forging in progress.";
  if (h < 21) return "Evening session. The runes glow brighter at dusk.";
  return "Late night forging. The spirits are restless.";
}

function pickQuip(): string {
  // ~30% chance of time-of-day greeting, otherwise random quip
  if (Math.random() < 0.3) return getTimeGreeting();
  return IDLE_QUIPS[Math.floor(Math.random() * IDLE_QUIPS.length)] as string;
}

interface LandingPageProps {
  bootProviders: ProviderStatus[];
  bootPrereqs: PrerequisiteStatus[];
  activeModel?: string;
}

export function LandingPage({ bootProviders, bootPrereqs, activeModel }: LandingPageProps) {
  const tk = useTheme();
  const { width, height } = useTerminalDimensions();
  const columns = width ?? 80;
  const rows = height ?? 24;

  const compact = rows < 20;
  const showWordmark = columns >= 35;

  /* ── Glitch-decode entrance (tick-gated like UpdateModal/ShutdownSplash) ── */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick >= 14) return;
    const timer = setInterval(() => setTick((t) => t + 1), 60);
    return () => clearInterval(timer);
  }, [tick]);

  const ghostChar = tick < GHOST_FADE.length ? (GHOST_FADE[tick] ?? "░") : icon("ghost");
  const wordmarkGarbled = tick < 5;
  const taglineReady = tick >= 6;
  const statusReady = tick >= 8;
  const hintsReady = tick >= 10;

  /* ── Wisp animation ── */
  const wispFrame = WISP_FRAMES[tick % WISP_FRAMES.length] ?? "";

  /* ── Slow ghost breathe (after materialization) ── */
  const glowCycle = useMemo(
    () => [tk.brand, tk.brand, tk.brandAlt, tk.brand, tk.brand, tk.brandDim],
    [tk.brand, tk.brandAlt, tk.brandDim],
  );
  const [glowIdx, setGlowIdx] = useState(0);
  useEffect(() => {
    if (tick < GHOST_FADE.length) return;
    const timer = setInterval(() => setGlowIdx((g) => (g + 1) % glowCycle.length), 2500);
    return () => clearInterval(timer);
  }, [tick, glowCycle]);
  const ghostColor = tick < GHOST_FADE.length ? tk.brand : (glowCycle[glowIdx] ?? tk.brand);

  /* ── Quip — stable per mount ── */
  const quip = useMemo(() => pickQuip(), []);

  /* ── Status data ── */
  const activeProviders = useMemo(() => bootProviders.filter((p) => p.available), [bootProviders]);
  const missingRequired = useMemo(
    () => bootPrereqs.filter((p) => !p.installed && p.prerequisite.required),
    [bootPrereqs],
  );
  const allToolsOk = useMemo(
    () => bootPrereqs.every((p) => p.installed || !p.prerequisite.required),
    [bootPrereqs],
  );
  const anyProvider = activeProviders.length > 0;

  const divW = Math.min(WORDMARK[0]?.length ?? 30, columns - 8);

  /* ── Model label ── */
  const modelLabel = activeModel ? getShortModelLabel(activeModel) : null;

  return (
    <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} justifyContent="center">
      <box flexDirection="column" alignItems="center" gap={0}>
        {/* ── Ghost materializes through fade stages ── */}
        <text fg={ghostColor} attributes={BOLD}>
          {ghostChar}
        </text>
        <text fg={tk.brandDim} attributes={DIM}>
          {wispFrame}
        </text>

        {!compact && <box height={1} />}

        {/* ── Wordmark with glitch-decode (matches ShutdownSplash style) ── */}
        {showWordmark ? (
          WORDMARK.map((line) => (
            <text key={line} fg={tk.brand} attributes={BOLD}>
              {wordmarkGarbled ? garble(line) : line}
            </text>
          ))
        ) : (
          <text fg={tk.brand} attributes={BOLD}>
            {wordmarkGarbled ? garble("SOULFORGE") : "SOULFORGE"}
          </text>
        )}

        {/* ── Tagline ── */}
        {taglineReady && (
          <box flexDirection="row" gap={0}>
            <text fg={tk.textDim}>{"── "}</text>
            <text fg={tk.textMuted} attributes={ITALIC}>
              Graph-Powered Code Intelligence
            </text>
            <text fg={tk.textDim}>{" ──"}</text>
          </box>
        )}

        {!compact && <box height={1} />}

        {/* ── Scan divider — runs once then settles ── */}
        <ScanDivider width={divW} />

        {/* ── Quip ── */}
        {taglineReady && (
          <>
            {!compact && <box height={1} />}
            <text fg={tk.brandAlt} attributes={ITALIC}>
              {quip}
            </text>
          </>
        )}

        {/* ── Compact status line ── */}
        {statusReady && (
          <>
            {!compact && <box height={1} />}
            <StatusLine providers={activeProviders} allToolsOk={allToolsOk} />
            <IndexingStatus />
            {(missingRequired.length > 0 || !anyProvider) && (
              <text fg={tk.textDim}>/setup to configure</text>
            )}
          </>
        )}

        {/* ── Model hint + help ── */}
        {hintsReady && (
          <>
            {!compact && <box height={1} />}
            <box flexDirection="row" gap={0} justifyContent="center">
              {modelLabel && (
                <>
                  <text fg={tk.textDim}>^L </text>
                  <text fg={tk.brand} attributes={BOLD}>
                    {modelLabel}
                  </text>
                  <text fg={tk.textFaint}>{" · "}</text>
                </>
              )}
              <text fg={tk.textDim}>/</text>
              <text fg={tk.textSecondary}>help</text>
            </box>
          </>
        )}

        {compact ? null : <box height={1} />}
      </box>
    </box>
  );
}

/* ── Compact single-line status ── */
function StatusLine({
  providers,
  allToolsOk,
}: {
  providers: ProviderStatus[];
  allToolsOk: boolean;
}) {
  const tk = useTheme();
  const names = providers.slice(0, 4).map((p) => p.name.toLowerCase());
  const overflow = providers.length > 4 ? providers.length - 4 : 0;

  return (
    <box flexDirection="row" gap={0} justifyContent="center">
      {providers.length > 0 ? (
        <text fg={tk.textMuted}>
          {names.join(" · ")}
          {overflow > 0 ? ` +${String(overflow)}` : ""}
        </text>
      ) : (
        <text fg={tk.warning}>○ no providers configured</text>
      )}
      {allToolsOk && (
        <>
          <text fg={tk.textFaint}>{" · "}</text>
          <text fg={tk.textMuted}>tools ready</text>
        </>
      )}
    </box>
  );
}

/* ── Indexing + LSP status ── */
function IndexingStatus() {
  const tk = useTheme();
  const [state, setState] = useState(() => {
    const s = useRepoMapStore.getState();
    return {
      status: s.status,
      files: s.files,
      scanProgress: s.scanProgress,
      lspStatus: s.lspStatus,
    };
  });
  const spinFrame = useSpinnerFrame();

  useEffect(
    () =>
      useRepoMapStore.subscribe((s) => {
        setState((prev) => {
          if (
            prev.status === s.status &&
            prev.files === s.files &&
            prev.scanProgress === s.scanProgress &&
            prev.lspStatus === s.lspStatus
          )
            return prev;
          return {
            status: s.status,
            files: s.files,
            scanProgress: s.scanProgress,
            lspStatus: s.lspStatus,
          };
        });
      }),
    [],
  );

  const { status, files, scanProgress, lspStatus } = state;
  const frame = SPINNER_FRAMES[spinFrame % SPINNER_FRAMES.length] ?? "⠋";

  if (status === "scanning") {
    return (
      <box flexDirection="row" gap={0} justifyContent="center">
        <text fg={tk.amber}>
          {frame} indexing{scanProgress ? ` ${scanProgress}` : "…"}
        </text>
      </box>
    );
  }

  // Ready or error — show combined line
  const parts: React.ReactNode[] = [];

  if (status === "ready") {
    parts.push(
      <text key="idx" fg={tk.textMuted}>
        {icon("check")} {String(files)} files indexed
      </text>,
    );
  } else if (status === "error") {
    parts.push(
      <text key="idx" fg={tk.brandSecondary}>
        ○ indexing failed
      </text>,
    );
  }

  if (lspStatus === "ready" && parts.length > 0) {
    parts.push(
      <text key="sep" fg={tk.textFaint}>
        {" · "}
      </text>,
    );
    parts.push(
      <text key="lsp" fg={tk.textMuted}>
        lsp ready
      </text>,
    );
  } else if (lspStatus === "generating") {
    if (parts.length > 0) {
      parts.push(
        <text key="sep" fg={tk.textFaint}>
          {" · "}
        </text>,
      );
    }
    parts.push(
      <text key="lsp" fg={tk.amber}>
        lsp warming up
      </text>,
    );
  }

  if (parts.length === 0) return null;

  return (
    <box flexDirection="row" gap={0} justifyContent="center">
      {parts}
    </box>
  );
}
