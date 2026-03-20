import { TextAttributes } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import { BRAND_PURPLE, BRAND_RED, type BrandSegment } from "../../core/utils/splash.js";

const PHRASES: BrandSegment[][] = [
  [
    { text: "by ", color: "#333" },
    { text: "Proxy", color: BRAND_PURPLE },
    { text: "Soul", color: BRAND_RED },
  ],
  [
    { text: "proxy", color: BRAND_PURPLE },
    { text: "soul", color: BRAND_RED },
    { text: ".com", color: "#555" },
  ],
];

const FIXED_WIDTH = Math.max(...PHRASES.map((p) => p.reduce((n, s) => n + s.text.length, 0))) + 1;
const HOLD_MS = 12_000;
const TYPE_MS = 45;
const ERASE_MS = 30;

function plainLength(segs: BrandSegment[]): number {
  return segs.reduce((n, s) => n + s.text.length, 0);
}

type Phase = "hold" | "erase" | "type" | "pause";

interface BrandState {
  phraseIdx: number;
  visibleChars: number;
  phase: Phase;
}

export function BrandTag() {
  const [state, setState] = useState<BrandState>({
    phraseIdx: 0,
    visibleChars: 0,
    phase: "type",
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { phraseIdx, visibleChars, phase } = state;
  const phrase = PHRASES[phraseIdx] ?? PHRASES[0] ?? [];
  const totalChars = plainLength(phrase);
  const animating = phase === "erase" || phase === "type" || phase === "pause";

  useEffect(() => {
    if (phase === "hold") {
      timerRef.current = setTimeout(() => setState((s) => ({ ...s, phase: "erase" })), HOLD_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    if (phase === "erase") {
      if (visibleChars <= 0) {
        setState((s) => ({
          ...s,
          phraseIdx: (s.phraseIdx + 1) % PHRASES.length,
          visibleChars: 0,
          phase: "pause",
        }));
        return;
      }
      timerRef.current = setTimeout(
        () => setState((s) => ({ ...s, visibleChars: s.visibleChars - 1 })),
        ERASE_MS,
      );
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    if (phase === "pause") {
      timerRef.current = setTimeout(() => setState((s) => ({ ...s, phase: "type" })), 200);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    // phase === "type"
    if (visibleChars >= totalChars) {
      setState((s) => ({ ...s, phase: "hold" }));
      return;
    }
    timerRef.current = setTimeout(
      () => setState((s) => ({ ...s, visibleChars: s.visibleChars + 1 })),
      TYPE_MS,
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, visibleChars, totalChars]);

  let remaining = visibleChars;
  const parts: { text: string; color: string }[] = [];
  for (const seg of phrase) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, seg.text.length);
    parts.push({ text: seg.text.slice(0, take), color: seg.color });
    remaining -= take;
  }

  const pad = FIXED_WIDTH - visibleChars - (animating ? 1 : 0);

  return (
    <box width={FIXED_WIDTH} flexShrink={0}>
      <text attributes={TextAttributes.ITALIC}>
        {pad > 0 && <span>{" ".repeat(pad)}</span>}
        {parts.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable segments
          <span key={i} fg={p.color}>
            {p.text}
          </span>
        ))}
        {animating && <span fg={BRAND_RED}>█</span>}
      </text>
    </box>
  );
}
