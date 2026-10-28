import { displayFaces, fontScaling, type TypographyToken, typography } from "@turnout/design-tokens";
import { createContext, useContext } from "react";
import { PixelRatio } from "react-native";

/** The text size a story or test pretends the person chose: the largest the system settings give (Android tops out at 2). */
export const LARGEST_TEXT_SCALE = 2;

/** At or above this the layout is in its large-text form (single column, no side-by-side pairs). */
export const LARGE_TEXT_FROM = 1.3;

/**
 * Stories and tests set this to show a screen at a given text size. Null, the app's normal state, follows the system. A number
 * makes `Text` size itself from the tokens times that number, under the same caps the system size would meet.
 */
export const TextScaleContext = createContext<number | null>(null);

export function useFontScale(): number {
  const forced = useContext(TextScaleContext);
  return forced ?? PixelRatio.getFontScale();
}

export function isLargeText(scale: number): boolean {
  return scale >= LARGE_TEXT_FROM;
}

/** The scale a type style actually reaches: the person's scale up to the style's cap, and exactly 1 for fixed styles. */
export function scaleFor(token: TypographyToken, scale: number): number {
  const rule = fontScaling[token];
  if (!rule.allowFontScaling) return 1;
  return rule.maxFontSizeMultiplier === undefined ? scale : Math.min(scale, rule.maxFontSizeMultiplier);
}

export function scaledMetrics(token: TypographyToken, scale: number): { fontSize: number; lineHeight: number } {
  const { fontSize, lineHeight } = typography[token];
  const k = scaleFor(token, scale);
  return { fontSize: fontSize * k, lineHeight: lineHeight * k };
}

/** Rough width of a Big Shoulders Display glyph as a share of its size. The face is condensed, so this is well under 1. */
const GLYPH_WIDTH = 0.42;

/**
 * The size for a display-face string inside a fixed box: the largest size in the face's range for which the text wraps to at most
 * `maxLines` lines. Display text does not follow the system text size, so the box and this size are the same for everyone.
 */
export function fitDisplaySize(text: string, boxWidth: number, face: keyof typeof displayFaces, maxLines: number): number {
  const { minFontSize, maxFontSize } = displayFaces[face];
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let size = maxFontSize; size > minFontSize; size -= 2) {
    if (linesNeeded(words, boxWidth, size) <= maxLines) return size;
  }
  return minFontSize;
}

function linesNeeded(words: string[], boxWidth: number, size: number): number {
  const charWidth = GLYPH_WIDTH * size;
  const perLine = Math.max(1, Math.floor(boxWidth / charWidth));
  let lines = 1;
  let used = 0;
  for (const word of words) {
    if (word.length > perLine) return Number.POSITIVE_INFINITY;
    const needed = used === 0 ? word.length : used + 1 + word.length;
    if (needed <= perLine) used = needed;
    else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}
