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
