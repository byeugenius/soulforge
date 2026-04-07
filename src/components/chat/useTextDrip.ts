import { useEffect, useRef, useState } from "react";

const TICK_MS = 32; // ~30fps drain loop
const MIN_SPEED = 0.8; // chars/tick floor
const MAX_SPEED = 16; // chars/tick ceiling
const ACCEL = 0.15; // velocity ramp-up per tick (easing)
const DECEL = 0.4; // velocity ramp-down when buffer drains
const CATCHUP_RAMP = 0.4; // extra accel when buffer is large (smooth catch-up)
const CATCHUP_THRESHOLD = 60; // buffer size to trigger catch-up

/**
 * Drip-feeds text for a smooth typewriter effect during streaming.
 *
 * Features:
 * - Word-aware: snaps to word/punctuation boundaries instead of cutting mid-word
 * - Easing: velocity ramps up/down smoothly instead of stepping
 * - Catch-up: large buffer surges accelerate gradually, not instantly
 * - Fresh tracking: returns how many chars were just revealed (for dim→bright)
 *
 * Easy to remove: replace `useTextDrip(text, streaming)` with just
 * `{ text, freshCount: 0 }` or delete the hook entirely.
 */
export function useTextDrip(
  fullText: string,
  streaming: boolean,
): { text: string; freshCount: number } {
  const [drip, setDrip] = useState({ revealed: 0, fresh: 0 });
  const bufferRef = useRef(0);
  const prevLenRef = useRef(0);
  const velocityRef = useRef(MIN_SPEED);
  const fullTextRef = useRef(fullText);
  fullTextRef.current = fullText;

  // Accumulate incoming content into buffer
  useEffect(() => {
    const delta = fullText.length - prevLenRef.current;
    if (delta > 0) {
      bufferRef.current += delta;
    }
    prevLenRef.current = fullText.length;
  }, [fullText]);

  // Flush on stream end
  useEffect(() => {
    if (!streaming) {
      setDrip({ revealed: fullTextRef.current.length, fresh: 0 });
      bufferRef.current = 0;
      prevLenRef.current = fullTextRef.current.length;
      velocityRef.current = MIN_SPEED;
    }
  }, [streaming]);

  // Steady drain with easing
  useEffect(() => {
    if (!streaming) return;

    const timer = setInterval(() => {
      const buf = bufferRef.current;
      if (buf <= 0) {
        velocityRef.current = Math.max(MIN_SPEED, velocityRef.current * DECEL);
        setDrip((prev) => (prev.fresh === 0 ? prev : { ...prev, fresh: 0 }));
        return;
      }

      const accel = buf > CATCHUP_THRESHOLD ? ACCEL + CATCHUP_RAMP : ACCEL;
      const targetSpeed = Math.min(MAX_SPEED, MIN_SPEED + buf * 0.08);
      velocityRef.current = Math.min(
        MAX_SPEED,
        velocityRef.current + (targetSpeed - velocityRef.current) * accel,
      );

      const rawChars = Math.max(1, Math.round(velocityRef.current));
      const drain = Math.min(rawChars, buf);

      setDrip((prev) => {
        const target = Math.min(prev.revealed + drain, fullTextRef.current.length);
        const snapped = snapToWordBoundary(fullTextRef.current, prev.revealed, target);
        const actual = snapped - prev.revealed;
        bufferRef.current = Math.max(0, bufferRef.current - actual);
        return { revealed: snapped, fresh: actual };
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [streaming]);

  if (!streaming) return { text: fullText, freshCount: 0 };

  return { text: fullText.slice(0, drip.revealed), freshCount: drip.fresh };
}

/**
 * Snap a reveal target to a word boundary to avoid cutting mid-word.
 * Looks ahead up to 8 chars for whitespace/punctuation. If none found,
 * allows the cut (don't stall on long words).
 */
function snapToWordBoundary(text: string, from: number, target: number): number {
  if (target >= text.length) return text.length;

  const ch = text[target];
  // Already at a boundary
  if (!ch || /[\s.,;:!?\-\n\r]/.test(ch)) return target;

  // Look ahead for a nearby boundary (max 8 chars)
  for (let i = target + 1; i < Math.min(target + 8, text.length); i++) {
    const c = text[i];
    if (c && /[\s.,;:!?\-\n\r]/.test(c)) return i;
  }

  // No nearby boundary — look back instead (max 4 chars, don't go before from)
  for (let i = target - 1; i > Math.max(from, target - 4); i--) {
    const c = text[i];
    if (c && /[\s.,;:!?\-\n\r]/.test(c)) return i + 1;
  }

  // Long unbroken word — just cut at target
  return target;
}
