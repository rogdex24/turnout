import { sizes } from "@turnout/design-tokens";
import { Pressable, type PressableProps } from "react-native";
import { cn } from "../cn";
import { resolveStyle, scaleOnPress } from "./press";
import { Text } from "./Text";

export interface TextButtonProps extends Omit<PressableProps, "children"> {
  /** The visible label, also the accessibility label. */
  title: string;
  /** Over a photo: the on-photo text color. */
  onPhoto?: boolean;
  /** A quiet link inside a sentence-sized spot: underlined, medium weight. */
  link?: boolean;
  className?: string;
}

/** A button with no fill or border, 44 dp tall: Skip, Resend, Change number. */
export function TextButton({ title, onPhoto = false, link = false, className, style, ...rest }: TextButtonProps) {
  return (
    <Pressable
      accessibilityRole={link ? "link" : "button"}
      accessibilityLabel={title}
      className={cn("items-center justify-center px-3", className)}
      style={(state) => [{ minHeight: sizes.hitMin }, scaleOnPress(state), resolveStyle(style, state)]}
      {...rest}
    >
      <Text variant="control" className={cn(onPhoto ? "text-on-photo" : "text-ink", link && "underline decoration-muted")}>
        {title}
      </Text>
    </Pressable>
  );
}
