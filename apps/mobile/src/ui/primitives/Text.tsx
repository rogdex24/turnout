import { type TypographyToken, typography } from "@turnout/design-tokens";
import { useContext } from "react";
import { Platform, Text as RNText, StyleSheet, type TextProps, type TextStyle } from "react-native";
import { cn } from "../cn";
import { scaledMetrics, TextScaleContext } from "../textScale";
import { displayLeadingFix, fontVariantFor, scalingFor, textClass } from "../typography";

export interface AppTextProps extends TextProps {
  /** A type token from DESIGN.md. Body text by default. */
  variant?: TypographyToken;
  /** Data (a time, a date, a price, a count, a code) is set in tabular figures. */
  tabular?: boolean;
  className?: string;
}

/** Text in one of the design tokens' type styles, with the font scaling caps the tokens set. */
export function Text({ variant = "body", tabular = false, className, style, ...rest }: AppTextProps) {
  const forcedScale = useContext(TextScaleContext);
  const fontVariant: TextStyle["fontVariant"] = tabular ? ["tabular-nums"] : fontVariantFor(variant);
  const forced = forcedScale === null ? null : scaledMetrics(variant, forcedScale);
  const display = displayMetrics(variant, className, style);
  // Sets the top and bottom margins on iOS, so a display-face Text takes its spacing from a wrapping View, not mt- or mb- classes.
  const leading = display ? displayLeadingFix(Platform.OS, display.fontSize, display.lineHeight) : null;
  return (
    <RNText
      {...scalingFor(variant)}
      {...(forced ? { allowFontScaling: false } : null)}
      className={cn(textClass[variant], "text-ink", className)}
      style={[fontVariant ? { fontVariant } : null, forced, leading, style]}
      {...rest}
    />
  );
}

/** Size and line height of text in the display face: a display token, or `font-display` with both set in `style`. */
function displayMetrics(
  variant: TypographyToken,
  className: string | undefined,
  style: TextProps["style"],
): { fontSize: number; lineHeight: number } | null {
  const flat = StyleSheet.flatten(style) ?? {};
  if (variant === "display-hero" || variant === "display-band") {
    const token = typography[variant];
    return { fontSize: flat.fontSize ?? token.fontSize, lineHeight: flat.lineHeight ?? token.lineHeight };
  }
  if (!className?.split(" ").includes("font-display") || flat.fontSize === undefined || flat.lineHeight === undefined) return null;
  return { fontSize: flat.fontSize, lineHeight: flat.lineHeight };
}
