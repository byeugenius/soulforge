import { fg as fgStyle, StyledText, type TextRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import { getThemeTokens } from "../../core/theme/index.js";
import { formatElapsed } from "../../hooks/useElapsed.js";
import { useStatusBarStore } from "../../stores/statusbar.js";
import { forgeSpinnerChunks, FORGE_TICK_MS } from "./ForgeSpinner.js";

const FORGE_STATUSES = [
  "Forging response…",
  "Stoking the flames…",
  "Summoning spirits…",
  "Channeling the ether…",
  "Tempering thoughts…",
  "Conjuring words…",
  "Consulting the runes…",
  "Weaving spellwork…",
  "Kindling the forge…",
  "Gathering arcana…",
];

function buildBusyContent(
  spinnerFrame: number,
  isCompacting: boolean,
  forgeStatus: string,
  elapsedSec: number,
  queueCount: number | undefined,
): StyledText {
  const tk = getThemeTokens();
  const statusColor = isCompacting ? tk.info : tk.brand;
  const statusText = isCompacting ? "Compacting context…" : forgeStatus;

  const parts: ReturnType<ReturnType<typeof fgStyle>>[] = [
    fgStyle(statusColor)(" "),
    ...forgeSpinnerChunks(spinnerFrame, tk.brand, tk.textMuted, tk.textFaint, tk.warning),
    fgStyle(statusColor)(` ${statusText}`),
  ];
  if (elapsedSec > 0) {
    parts.push(fgStyle(tk.textMuted)(` ${formatElapsed(elapsedSec)}`));
  }
  if (queueCount != null && queueCount > 0) {
    parts.push(fgStyle(tk.textMuted)(` (${String(queueCount)} queued)`));
  }
  parts.push(fgStyle(tk.textFaint)("  "));
  parts.push(fgStyle(tk.error)("^X"));
  parts.push(fgStyle(tk.textMuted)(" stop"));
  return new StyledText(parts);
}

function buildCompletedContent(time: string): StyledText {
  const tk = getThemeTokens();
  return new StyledText([
    fgStyle(tk.success)(" ✓ "),
    fgStyle(tk.textMuted)(`Completed in ${time}`),
  ]);
}

interface LoadingStatusProps {
  isLoading: boolean;
  isCompacting: boolean;
  queueCount?: number;
  loadingStartedAt?: number;
}

export function LoadingStatus({
  isLoading,
  isCompacting,
  queueCount,
  loadingStartedAt,
}: LoadingStatusProps) {
  const busyRef = useRef<TextRenderable>(null);
  const completedRef = useRef<TextRenderable>(null);
  const forgeStatusRef = useRef("");
  const wasLoadingRef = useRef(false);
  const loadingStartRef = useRef(0);
  const completedTimeRef = useRef<string | null>(null);
  const elapsedSecRef = useRef(0);
  const spinnerTickRef = useRef(0);
  const propsRef = useRef({ isLoading, isCompacting, queueCount });
  propsRef.current = { isLoading, isCompacting, queueCount };

  const showBusy = isLoading || isCompacting;

  if (isLoading && !wasLoadingRef.current) {
    forgeStatusRef.current = FORGE_STATUSES[
      Math.floor(Math.random() * FORGE_STATUSES.length)
    ] as string;
    loadingStartRef.current = loadingStartedAt || Date.now();
    elapsedSecRef.current = 0;
    completedTimeRef.current = null;
  }

  // Compute completed time synchronously during render (not in useEffect)
  // so the "Completed in Xs" message appears immediately when loading stops.
  if (!isLoading && wasLoadingRef.current && loadingStartRef.current) {
    const finalSec = Math.floor((Date.now() - loadingStartRef.current) / 1000);
    completedTimeRef.current = finalSec > 0 ? formatElapsed(finalSec) : "<1s";
  }

  wasLoadingRef.current = isLoading;

  // Single interval: spinner tick (150ms) + elapsed update (every ~1s via modulo)
  useEffect(() => {
    if (!showBusy) {
      if (completedTimeRef.current && completedRef.current) {
        try {
          completedRef.current.content = buildCompletedContent(completedTimeRef.current);
        } catch {}
      }
      return;
    }
    const timer = setInterval(() => {
      spinnerTickRef.current++;
      const { isLoading: ld, isCompacting: cp, queueCount: qc } = propsRef.current;
      const elapsed = cp
        ? useStatusBarStore.getState().compactElapsed
        : ld
          ? Math.floor((Date.now() - loadingStartRef.current) / 1000)
          : 0;
      elapsedSecRef.current = elapsed;
      try {
        if (busyRef.current) {
          busyRef.current.content = buildBusyContent(
            spinnerTickRef.current,
            cp,
            forgeStatusRef.current,
            elapsed,
            qc,
          );
        }
      } catch {}
    }, FORGE_TICK_MS);
    return () => clearInterval(timer);
  }, [showBusy]);

  return (
    <box paddingX={0} flexDirection="column" flexShrink={0}>
      <box height={1} flexDirection="row">
        {showBusy ? (
          <text
            ref={busyRef}
            truncate
            content={buildBusyContent(
              spinnerTickRef.current,
              isCompacting,
              forgeStatusRef.current,
              elapsedSecRef.current,
              queueCount,
            )}
          />
        ) : completedTimeRef.current ? (
          <text
            ref={completedRef}
            truncate
            content={buildCompletedContent(completedTimeRef.current)}
          />
        ) : null}
      </box>
    </box>
  );
}
