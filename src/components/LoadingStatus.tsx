import { useEffect, useRef, useState } from "react";
import { icon } from "../core/icons.js";

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

const ghostIcon = () => icon("ghost");
const GHOST_FRAMES = [ghostIcon, ghostIcon, ghostIcon, () => " "] as const;
const GHOST_SPEED = 400;
const COMPLETED_DISPLAY_MS = 5000;

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${String(h)}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${String(m)}m ${String(s).padStart(2, "0")}s`;
  return `${String(s)}s`;
}

interface LoadingStatusProps {
  isLoading: boolean;
  isCompacting: boolean;
  queueCount?: number;
}

export function LoadingStatus({ isLoading, isCompacting, queueCount }: LoadingStatusProps) {
  const showBusy = isLoading || isCompacting;
  const [ghostTick, setGhostTick] = useState(0);
  const forgeStatusRef = useRef("");
  const wasLoadingRef = useRef(false);
  const loadingStartRef = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [completedTime, setCompletedTime] = useState<string | null>(null);
  const completedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (isLoading && !wasLoadingRef.current) {
    forgeStatusRef.current = FORGE_STATUSES[
      Math.floor(Math.random() * FORGE_STATUSES.length)
    ] as string;
    loadingStartRef.current = Date.now();
    if (completedTimerRef.current) {
      clearTimeout(completedTimerRef.current);
      completedTimerRef.current = null;
    }
    setCompletedTime(null);
  }

  if (!isLoading && wasLoadingRef.current && loadingStartRef.current > 0) {
    const finalSec = Math.floor((Date.now() - loadingStartRef.current) / 1000);
    if (finalSec > 0) {
      setCompletedTime(formatElapsed(finalSec));
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
      completedTimerRef.current = setTimeout(() => {
        setCompletedTime(null);
        completedTimerRef.current = null;
      }, COMPLETED_DISPLAY_MS);
    }
  }
  wasLoadingRef.current = isLoading;

  useEffect(() => {
    if (!showBusy) {
      setElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setGhostTick((t) => t + 1);
      if (isLoading) {
        setElapsedSec(Math.floor((Date.now() - loadingStartRef.current) / 1000));
      }
    }, GHOST_SPEED);
    return () => clearInterval(timer);
  }, [showBusy, isLoading]);

  useEffect(() => {
    return () => {
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
    };
  }, []);

  if (!showBusy && !completedTime) return null;

  if (!showBusy && completedTime) {
    return (
      <box paddingX={1} height={1} gap={1} flexDirection="row" flexShrink={0}>
        <text fg="#2a5">✓</text>
        <text fg="#555">Completed in {completedTime}</text>
      </box>
    );
  }

  const ghostFrameFn = GHOST_FRAMES[ghostTick % GHOST_FRAMES.length];
  const currentGhost = ghostFrameFn ? ghostFrameFn() : " ";
  const busyStatus = isCompacting ? "Compacting context…" : forgeStatusRef.current;

  const elapsedLabel = isLoading && elapsedSec > 0 ? formatElapsed(elapsedSec) : "";

  return (
    <box paddingX={1} height={1} gap={1} flexDirection="row" flexShrink={0}>
      <text fg={isCompacting ? "#5af" : "#8B5CF6"}>{currentGhost}</text>
      <text fg={isCompacting ? "#3388cc" : "#6A0DAD"}>{busyStatus}</text>
      {elapsedLabel !== "" && <text fg="#555">{elapsedLabel}</text>}
      {queueCount != null && queueCount > 0 && <text fg="#555">({String(queueCount)} queued)</text>}
    </box>
  );
}
