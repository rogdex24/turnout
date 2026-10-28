import type { TypographyToken } from "@turnout/design-tokens";
import { useContext } from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { cn } from "../cn";
import { scaledMetrics, TextScaleContext } from "../textScale";
import { fontVariantFor, scalingFor, textClass } from "../typography";

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
  return (
    <RNText
      {...scalingFor(variant)}
      {...(forced ? { allowFontScaling: false } : null)}
      className={cn(textClass[variant], "text-ink", className)}
      style={[fontVariant ? { fontVariant } : null, forced, style]}
      {...rest}
    />
  );
}
