import { fg as fgStyle } from "@opentui/core";
import { memo, useEffect, useRef } from "react";
import { useTheme } from "../../core/theme/index.js";

/**
 * SoulForge branded spinner — Elder Futhark rune cycle.
 *
 * Cycles through full-height runes that tell a forging story:
 *   seed → kindle → flame → DAWN → completion → rest → seed
 *
 * All runes are from the full-height set (no mid-dots) so they
 * align properly with surrounding text.
 *
 * Color shifts smoothly with intensity:
 *   faint → muted → brand → bright → SPARK → bright → brand → muted → faint
 *
 * Single character wide. Nerd font not required — runes are in
 * the Unicode Runic block (U+16A0–U+16FF), supported everywhere.
 */

// ── Rune frames ─────────────────────────────────────────────────────
// [rune, intensity] — intensity drives color
// 0=faint, 1=muted, 2=brand, 3=bright, 4=spark

type Intensity = 0 | 1 | 2 | 3 | 4;
type RuneFrame = [string, Intensity];

const RUNE_FRAMES: RuneFrame[] = [
  // Seed phase — potential gathering
  ["ᛜ", 0], // Ingwaz — seed/potential
  ["ᚾ", 0], // Nauthiz — need-fire (friction)
  // Kindle phase — fire catches
  ["ᚲ", 1], // Kenaz — torch kindles
  ["ᚠ", 1], // Fehu — fire catches
  // Flame phase — rising
  ["ᛊ", 2], // Sowilo — sun/flame rises
  ["ᛏ", 2], // Tiwaz — power ascending
  // Blaze phase — peak approaching
  ["ᛉ", 3], // Algiz — reaching upward
  // PEAK — breakthrough
  ["ᛞ", 4], // Dagaz — DAWN (peak spark!)
  // Afterglow — completion
  ["ᛟ", 3], // Othala — heritage/completion
  ["ᛗ", 3], // Mannaz — soul forged
  // Cooling — settling
  ["ᛇ", 2], // Eihwaz — endurance
  ["ᚹ", 2], // Wunjo — satisfaction
  // Fading — cycle winding down
  ["ᛃ", 1], // Jera — harvest/cycle
  ["ᛁ", 1], // Isa — stillness
  // Rest — back to seed
  ["ᚺ", 0], // Hagalaz — rest
  ["ᛜ", 0], // Ingwaz — seed again
];

const FRAME_COUNT = RUNE_FRAMES.length;
const TICK_MS = 130; // ~2s full cycle — smooth but not frantic

// ── Color mapping ───────────────────────────────────────────────────

function intensityColor(
  intensity: Intensity,
  brand: string,
  muted: string,
  faint: string,
  spark: string,
): string {
  switch (intensity) {
    case 0:
      return faint;
    case 1:
      return muted;
    case 2:
      return brand;
    case 3:
      return brand;
    case 4:
      return spark;
  }
}

// ── Global tick (shared across all instances) ───────────────────────

let globalFrame = 0;
let refCount = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const frameListeners = new Set<(frame: number) => void>();

function ensureTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    globalFrame = (globalFrame + 1) % FRAME_COUNT;
    for (const fn of frameListeners) fn(globalFrame);
  }, TICK_MS);
}

// ── React component ─────────────────────────────────────────────────

export const ForgeSpinner = memo(function ForgeSpinner({ color }: { color?: string } = {}) {
  const t = useTheme();
  const textRef = useRef<any>(null);

  const brand = color ?? t.brand;
  const colorsRef = useRef({ brand, muted: t.textMuted, faint: t.textFaint, spark: t.warning });
  colorsRef.current = { brand, muted: t.textMuted, faint: t.textFaint, spark: t.warning };

  useEffect(() => {
    const listener = (f: number) => {
      const [rune, intensity] = RUNE_FRAMES[f % FRAME_COUNT]!;
      const c = colorsRef.current;
      try {
        if (textRef.current) {
          textRef.current.content = rune;
          textRef.current.fg = intensityColor(intensity, c.brand, c.muted, c.faint, c.spark);
        }
      } catch {}
    };
    frameListeners.add(listener);
    refCount++;
    ensureTick();
    return () => {
      frameListeners.delete(listener);
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

  const [rune, intensity] = RUNE_FRAMES[globalFrame % FRAME_COUNT]!;
  const fg = intensityColor(
    intensity,
    colorsRef.current.brand,
    colorsRef.current.muted,
    colorsRef.current.faint,
    colorsRef.current.spark,
  );

  return (
    <text ref={textRef} fg={fg}>
      {rune}
    </text>
  );
});

// ── Imperative API (for StyledText / status bar) ────────────────────

/** Build styled TextChunk[] for the current rune spinner frame. */
export function forgeSpinnerChunks(
  frame: number,
  brand: string,
  muted: string,
  faint: string,
  spark: string,
) {
  const [rune, intensity] = RUNE_FRAMES[frame % FRAME_COUNT]!;
  const fg = intensityColor(intensity, brand, muted, faint, spark);
  return [fgStyle(fg)(rune)];
}

export { TICK_MS as FORGE_TICK_MS };
