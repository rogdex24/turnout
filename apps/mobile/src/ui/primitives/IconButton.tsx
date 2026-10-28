import { sizes } from "@turnout/design-tokens";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { Pressable, type PressableProps } from "react-native";
import { cn } from "../cn";
import { Icon, type IconTone } from "./Icon";
import { resolveStyle, scaleOnPress } from "./press";

export interface IconButtonProps extends Omit<PressableProps, "children"> {
  icon: PhosphorIcon;
  /** The accessible name. Icon buttons have no visible label. */
  label: string;
  /** A hairline ring in the outline color. */
  ring?: boolean;
  /** Over a photo: a scrim disc and the on-photo icon color. */
  onPhoto?: boolean;
  tone?: IconTone;
  className?: string;
}

/** A 44 dp round icon button. */
export function IconButton({ icon, label, ring = false, onPhoto = false, tone, className, style, ...rest }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={0}
      className={cn(
        "items-center justify-center rounded-pill",
        ring && "border border-outline",
        onPhoto && "border border-line bg-scrim",
        className,
      )}
      style={(state) => [{ width: sizes.hitMin, height: sizes.hitMin }, scaleOnPress(state), resolveStyle(style, state)]}
      {...rest}
    >
      <Icon icon={icon} tone={tone ?? (onPhoto ? "onPhoto" : "ink")} />
    </Pressable>
  );
}
