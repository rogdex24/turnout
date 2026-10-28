import { pressed } from "@turnout/design-tokens";
import type { PressableStateCallbackType, StyleProp, ViewStyle } from "react-native";

/** Buttons, chips and icon buttons shrink while pressed. */
export function scaleOnPress({ pressed: down }: PressableStateCallbackType): ViewStyle | null {
  return down ? { transform: [{ scale: pressed.scale }] } : null;
}

/** Rows, cards and links dim while pressed. */
export function dimOnPress({ pressed: down }: PressableStateCallbackType): ViewStyle | null {
  return down ? { opacity: pressed.opacity } : null;
}

/** Resolves a Pressable `style` prop, which is either a style or a function of the press state. */
export function resolveStyle(
  style: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>) | undefined,
  state: PressableStateCallbackType,
): StyleProp<ViewStyle> {
  return typeof style === "function" ? style(state) : style;
}
