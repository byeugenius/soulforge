import { getThemeTokens } from "../theme/index.js";

/**
 * Hand-drawn ASCII "soulforge" wordmark in the Terminal Gothic voice
 * (inspired by littlebitspace.com). 7 rows: riser (l/f) + 5 body rows
 * + descender (s/g). Shared by boot splash, shutdown splash, and any
 * other surface that wants the full brand treatment.
 */
export const BIG_WORDMARK = [
  " _,                      ,4b.     ,sb                                   ",
  ",Jbs7'  ,db.    .4b J&,  4!`^    ,d8!   ,db.    ,b.4L   ,db.     ,sb    ",
  '8! 4.   8!`8|    8! !8  "4T^    "4T^    8!`8|   8!`\'    8!`8|   `8!`l   ',
  "Yl7`8|  8! 8!    8! !8   8!      8!     8! 8!   8!      8! 8!    8!'    ",
  " 4, 8;  8l.8;    8!,^8   8!      8!     8l.8;   8!      8l.8;    8! ,   ",
  "4F=s'   `\"^4\"   `^P `?' `^P'    `^P'    `\"^4\"   `^P'     _,8|   `^4\"    ",
  "                                                        4F=s'           ",
];

/** Compact fallback for narrow terminals — same typographic voice. */
export const SMALL_WORDMARK = [
  " _,                  ,sb                          ",
  ",Jbs7' ,db. .4b J, ,d8!  ,db. ,b.4L ,db.  ,sb     ",
  "8! 4.  8!`8 8! !8  \"4T^  8!`8 8!`'  8!`8 `8!`l    ",
  " 4, 8; 8l.; 8!,^8   8!   8l.; 8!    8l.;  8! ,    ",
  '4F=s\' `"4" `^P`?\' `^P\' `"4" `^P\'   _,8| `^4"     ',
  "                                     4F=s'        ",
];

/** Legacy 3-row wordmark. Kept for surfaces that haven't been migrated. */
export const WORDMARK = [
  "╔═╗╔═╗╦ ╦╦  ╔═╗╔═╗╦═╗╔═╗╔═╗",
  "╚═╗║ ║║ ║║  ╠╣ ║ ║╠╦╝║ ╦╠╣ ",
  "╚═╝╚═╝╚═╝╩═╝╚  ╚═╝╩╚═╚═╝╚═╝",
];

/** Pick the best wordmark for a given terminal width. */
export function pickWordmark(cols: number): string[] {
  const bigW = BIG_WORDMARK[0]?.length ?? 0;
  const smallW = SMALL_WORDMARK[0]?.length ?? 0;
  if (cols >= bigW + 4) return BIG_WORDMARK;
  if (cols >= smallW + 4) return SMALL_WORDMARK;
  return WORDMARK;
}

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
