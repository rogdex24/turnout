/**
 * Mobile tokens that DESIGN.md cannot hold, written by hand from docs/design/mobile-final/spec.md (sections 1 and 2).
 * Data only: no React, no React Native, no Reanimated. Colors and type styles are generated (tokens.generated.ts).
 * test/mobileTokens.test.ts pins the font scaling caps and the pressed feedback below.
 */
import type { TypographyToken } from "./tokens.generated";

/** Spacing in dp on a 4 grid (the same steps as DESIGN.md `spacing`), plus the page gutters. */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

/** Page gutter 16; hero text 20. */
export const gutter = { page: 16, hero: 20 } as const;

/** Corner radii in dp. Fields and faces 14, cards 16, the featured card 20, the top of a sheet 24, pill for buttons and chips. */
export const radii = {
  field: 14,
  face: 14,
  card: 16,
  featured: 20,
  sheet: 24,
  pill: 999,
} as const;

/** Hit areas and fixed heights in dp. Chips, icon buttons, links and rows are 44 or more. */
export const sizes = {
  hitMin: 44,
  buttonPrimary: 56,
  buttonSecondary: 48,
  row: 56,
  field: 56,
  focusRingWidth: 2,
  focusRingOffset: 2,
} as const;

/**
 * Display-face styles whose size is a range, which `design.md` types (one size each) cannot hold. The poster box and the
 * numeral slot are fixed, so the size is picked to fit the box and never follows the system text size.
 * `display-hero` and `display-band` are single sizes and live in DESIGN.md (tokens.generated.ts).
 */
export const displayFaces = {
  "display-poster": {
    fontFamily: "Big Shoulders",
    fontWeight: "800",
    minFontSize: 30,
    maxFontSize: 70,
    lineHeightRatio: 0.9,
    uppercase: true,
  },
  "display-numeral": {
    fontFamily: "Big Shoulders",
    fontWeight: "800",
    minFontSize: 24,
    maxFontSize: 36,
    lineHeightRatio: 0.9,
    uppercase: false,
  },
} as const;

/** Tabular figures on every time, date, price, count and code: `fontVariant` for those styles. */
export const tabularNums = ["tabular-nums"] as const;

/**
 * Spring configs for the three moments (group confirmed, meet card live, "I'm here") and the pressed return.
 * Plain numbers for Reanimated's `withSpring`; the app's animation helpers add `reduceMotion: ReduceMotion.System`.
 * Starting values, tuned on a device in M3.
 */
export const springs = {
  snappy: { damping: 20, stiffness: 320, mass: 1 },
  gentle: { damping: 22, stiffness: 140, mass: 1 },
  reveal: { damping: 18, stiffness: 120, mass: 1 },
} as const;

/** Loops (the finding pulse, the marquee bulbs, the equalizer) play a few times and stop. */
export const loopPlays = { pulse: 3, bulbs: 2, equalizer: 3 } as const;

/** Pressed feedback, in place within 100 ms: rows, cards and links dim; buttons, chips and icon buttons shrink. */
export const pressed = {
  durationMs: 100,
  opacity: 0.85,
  scale: 0.97,
  opacityFor: ["row", "card", "link"],
  scaleFor: ["button", "chip", "iconButton"],
} as const;

export interface FontScaling {
  allowFontScaling: boolean;
  /** Absent means the text follows the system size with no cap. */
  maxFontSizeMultiplier?: number;
}

const capped = (maxFontSizeMultiplier: number): FontScaling => ({ allowFontScaling: true, maxFontSizeMultiplier });
const uncapped: FontScaling = { allowFontScaling: true };
const fixed: FontScaling = { allowFontScaling: false };

/**
 * Font scaling per type style. Inter text scales: `display` and `title-large` up to 1.6, `label` and `badge` up to 1.3,
 * `control` up to 1.6 so buttons and chips keep their shape, the rest with no cap. Display-face styles are fixed (`allowFontScaling={false}`) inside fixed boxes; their labels scale.
 */
export const fontScaling: Record<TypographyToken | keyof typeof displayFaces, FontScaling> = {
  display: capped(1.6),
  "title-large": capped(1.6),
  title: uncapped,
  body: uncapped,
  control: capped(1.6),
  meta: uncapped,
  label: capped(1.3),
  badge: capped(1.3),
  "display-hero": fixed,
  "display-band": fixed,
  "display-poster": fixed,
  "display-numeral": fixed,
};
