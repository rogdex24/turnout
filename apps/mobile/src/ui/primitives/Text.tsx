import type { TypographyToken } from "@turnout/design-tokens";
import { Text as RNText, type TextProps } from "react-native";
import { cn } from "../cn";
import { fontVariantFor, scalingFor, textClass } from "../typography";

export interface AppTextProps extends TextProps {
  /** A type token from DESIGN.md. Body text by default. */
  variant?: TypographyToken;
  className?: string;
}

/** Text in one of the design tokens' type styles, with the font scaling caps the tokens set. */
export function Text({ variant = "body", className, style, ...rest }: AppTextProps) {
  const fontVariant = fontVariantFor(variant);
  return (
    <RNText
      {...scalingFor(variant)}
      className={cn(textClass[variant], "text-ink", className)}
      style={fontVariant ? [{ fontVariant }, style] : style}
      {...rest}
    />
  );
}
