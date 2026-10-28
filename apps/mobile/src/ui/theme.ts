import { type ColorRole, colors } from "@turnout/design-tokens";
import { useUniwind } from "uniwind";

type Palette = Record<ColorRole, string>;

/**
 * The palette for the current color scheme, for the few places that need a raw value (icon colors, native chrome). Everything else
 * uses a class name such as `bg-surface` or `text-ink`, which resolves the same tokens.
 */
export function useColors(): Palette {
  const { theme } = useUniwind();
  return theme === "dark" ? colors.dark : colors.light;
}
