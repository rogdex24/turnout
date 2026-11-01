import { type FontScaling, fontScaling, type TypographyToken, typography } from "@turnout/design-tokens";
import type { TextStyle } from "react-native";

/**
 * One class string per type token: the family, the weight and the size utility from src/theme.css (which also sets the line height
 * and letter spacing). The strings are written out in full, because Tailwind finds classes by scanning the source and would miss
 * names built at run time. src/ui/typography.test.ts checks each one against the generated tokens.
 */
export const textClass: Record<TypographyToken, string> = {
  display: "font-sans font-semibold text-display",
  "title-large": "font-sans font-semibold text-title-large",
  title: "font-sans font-semibold text-title",
  body: "font-sans font-normal text-body",
  control: "font-sans font-medium text-control",
  meta: "font-sans font-normal text-meta",
  label: "font-sans font-medium text-label",
  badge: "font-sans font-semibold text-badge",
  "display-hero": "font-display font-black text-display-hero",
  "display-band": "font-display font-extrabold text-display-band",
};

export function scalingFor(token: TypographyToken): FontScaling {
  return fontScaling[token];
}

/** Tabular figures on the styles that ask for them (the badge). */
export function fontVariantFor(token: TypographyToken): TextStyle["fontVariant"] {
  const style = typography[token];
  return "fontVariant" in style ? [...style.fontVariant] : undefined;
}

/** Big Shoulders' vertical metrics as a share of its size: hhea ascent 1971, descent 429, no line gap, cap height 1600, 2000 units. */
export const DISPLAY_FACE_METRICS = { ascent: 0.9855, descent: 0.2145, capHeight: 0.8 } as const;

export interface LeadingFix {
  paddingTop: number;
  marginTop: number;
  marginBottom: number;
}

/**
 * The display faces set a line height under the font's own (ascent plus descent). Android takes the cut half from the top and
 * half from the bottom, so the baseline sits near the line's bottom. iOS puts the baseline one descent above the line's bottom, so
 * the glyphs sit higher and the text view cuts their tops off. On iOS this moves the glyphs down to Android's place with top
 * padding and gives the space back with negative margins, so the layout around the text does not move. It also leaves room above
 * the line for a cap that is taller than the line. Null when no fix is needed.
 */
export function displayLeadingFix(os: string, fontSize: number, lineHeight: number): LeadingFix | null {
  const { ascent, descent, capHeight } = DISPLAY_FACE_METRICS;
  const natural = (ascent + descent) * fontSize;
  if (os !== "ios" || lineHeight >= natural) return null;
  const androidBaseline = ascent * fontSize - (natural - lineHeight) / 2;
  const iosBaseline = lineHeight - descent * fontSize;
  const shift = androidBaseline - iosBaseline;
  const capRoom = Math.ceil(Math.max(0, capHeight * fontSize - androidBaseline)) + 2;
  return { paddingTop: shift + capRoom, marginTop: -capRoom, marginBottom: -shift };
}
