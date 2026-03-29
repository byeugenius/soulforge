import { memo, useEffect, useState } from "react";
import { useTheme, useThemeStore } from "../../core/theme/index.js";

/** Reactive popup colors — auto-update when theme changes */
export let POPUP_BG = useThemeStore.getState().tokens.bgPopup;
export let POPUP_HL = useThemeStore.getState().tokens.bgPopupHighlight;
useThemeStore.subscribe((s) => {
  POPUP_BG = s.tokens.bgPopup;
  POPUP_HL = s.tokens.bgPopupHighlight;
});

/** Hook for popup colors — use in React components */
export function usePopupColors() {
  const t = useTheme();
  return { bg: t.bgPopup, hl: t.bgPopupHighlight, overlay: t.bgOverlay };
}

export type ConfigScope = "project" | "global";
export const CONFIG_SCOPES: ConfigScope[] = ["project", "global"];

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let globalFrame = 0;
let refCount = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const frameListeners = new Set<(frame: number) => void>();

function ensureTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    globalFrame = (globalFrame + 1) % SPINNER_FRAMES.length;
    for (const fn of frameListeners) fn(globalFrame);
  }, 150);
}

export function useSpinnerFrame(): number {
  const [frame, setFrame] = useState(globalFrame);
  useEffect(() => {
    refCount++;
    frameListeners.add(setFrame);
    ensureTick();
    return () => {
      frameListeners.delete(setFrame);
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        if (tickTimer) {
          clearInterval(tickTimer);
          tickTimer = null;
        }
      }
    };
  }, []);
  return frame;
}

export function Spinner({
  frames = SPINNER_FRAMES,
  color,
}: {
  frames?: string[];
  color?: string;
} = {}) {
  const t = useTheme();
  const frame = useSpinnerFrame();
  return <text fg={color ?? t.brand}>{frames[frame % frames.length]}</text>;
}

const OVERLAY_STYLE = { opacity: 0.65 } as const;

export function Overlay({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <box position="absolute" width="100%" height="100%">
      <box
        position="absolute"
        width="100%"
        height="100%"
        backgroundColor={t.bgOverlay}
        style={OVERLAY_STYLE}
      />
      <box
        position="absolute"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
      >
        {children}
      </box>
    </box>
  );
}

export const PopupRow = memo(function PopupRow({
  children,
  bg,
  w,
}: {
  children: React.ReactNode;
  bg?: string;
  w: number;
}) {
  const t = useTheme();
  const fill = bg ?? t.bgPopup;
  return (
    <box width={w} height={1} overflow="hidden">
      <box position="absolute">
        <text bg={fill}>{" ".repeat(w)}</text>
      </box>
      <box position="absolute" width={w} flexDirection="row">
        <text bg={fill}>{"  "}</text>
        {children}
      </box>
    </box>
  );
});
