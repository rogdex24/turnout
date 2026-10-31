import { sizes } from "@turnout/design-tokens";
import { Pressable, type PressableProps } from "react-native";
import { cn } from "../cn";
import { resolveStyle, scaleOnPress } from "./press";
import { Text } from "./Text";

export interface ChipProps extends Omit<PressableProps, "children"> {
  label: string;
  /** The chip is on: an ink pill with background-colored text. */
  selected?: boolean;
  className?: string;
}

/** A pill chip, 44 dp tall, for filters and quick choices. */
export function Chip({ label, selected = false, className, style, ...rest }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      className={cn(
        "items-center justify-center rounded-pill border px-4",
        selected ? "border-ink bg-ink" : "border-outline bg-transparent",
        className,
      )}
      style={(state) => [{ minHeight: sizes.hitMin }, scaleOnPress(state), resolveStyle(style, state)]}
      {...rest}
    >
      <Text variant="control" className={selected ? "text-center text-bg" : "text-center text-ink"}>
        {label}
      </Text>
    </Pressable>
  );
}
