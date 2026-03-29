import { getThemeTokens } from "../theme/index.js";

export const WORDMARK = [
  "┌─┐┌─┐┬ ┬┬  ┌─┐┌─┐┬─┐┌─┐┌─┐",
  "└─┐│ ││ ││  ├┤ │ │├┬┘│ ┬├┤ ",
  "└─┘└─┘└─┘┴─┘└  └─┘┴└─└─┘└─┘",
];

const GLITCH_POOL = "░▒▓█▄▀▐▌┤├┼─│┌┐└┘╔╗╚╝";

export const WISP_FRAMES = ["~∿~", "∿~∿", "·∿·", "∿·∿"];

export function garble(text: string): string {
  return [...text]
    .map((ch) =>
      ch === " " ? " " : (GLITCH_POOL[Math.floor(Math.random() * GLITCH_POOL.length)] ?? "█"),
    )
    .join("");
}

export interface BrandSegment {
  text: string;
  color: string;
}

/** Theme-aware brand segments — reads active theme at call time */
export function getBrandSegments(): BrandSegment[] {
  const t = getThemeTokens();
  return [
    { text: "by ", color: t.textSecondary },
    { text: "Proxy", color: t.brand },
    { text: "Soul", color: t.brandSecondary },
    { text: ".com", color: t.textSecondary },
  ];
}

/** @deprecated Use getBrandSegments() for theme support */
export const BRAND_SEGMENTS = new Proxy([] as BrandSegment[], {
  get(_, prop) {
    const segments = getBrandSegments();
    if (prop === "length") return segments.length;
    if (prop === Symbol.iterator) return segments[Symbol.iterator].bind(segments);
    const idx = typeof prop === "string" ? Number(prop) : Number.NaN;
    if (!Number.isNaN(idx)) return segments[idx];
    return (segments as never)[prop as never];
  },
});
