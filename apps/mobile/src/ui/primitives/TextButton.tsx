import { sizes } from "@turnout/design-tokens";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { cn } from "../cn";
import { Icon } from "./Icon";
import { resolveStyle, scaleOnPress } from "./press";
import { Text } from "./Text";

export interface TextButtonProps extends Omit<PressableProps, "children"> {
  /** The visible label, also the accessibility label. */
  title: string;
  /** Over a photo: the on-photo text color. */
  onPhoto?: boolean;
  /** A quiet link inside a sentence-sized spot: underlined, medium weight. */
  link?: boolean;
  /** An icon before the label, such as the clipboard on Paste. */
  icon?: PhosphorIcon;
  className?: string;
}

/** A button with no fill or border, 44 dp tall: Skip, Resend, Change number. */
export function TextButton({ title, onPhoto = false, link = false, icon, disabled, className, style, ...rest }: TextButtonProps) {
  return (
    <Pressable
      accessibilityRole={link ? "link" : "button"}
      accessibilityLabel={title}
      disabled={disabled}
      className={cn("items-center justify-center px-3", disabled && "opacity-40", className)}
      style={(state) => [{ minHeight: sizes.hitMin }, scaleOnPress(state), resolveStyle(style, state)]}
      {...rest}
    >
      <View className="flex-row items-center gap-1.5">
        {icon ? <Icon icon={icon} size="sm" tone={onPhoto ? "onPhoto" : "ink"} /> : null}
        <Text variant="control" className={cn(onPhoto ? "text-on-photo" : "text-ink", link && "underline decoration-muted")}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
