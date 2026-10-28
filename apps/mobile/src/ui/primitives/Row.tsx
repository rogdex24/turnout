import { sizes } from "@turnout/design-tokens";
import { CaretRight, type Icon as PhosphorIcon } from "phosphor-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { cn } from "../cn";
import { Icon } from "./Icon";
import { dimOnPress, resolveStyle } from "./press";
import { Text } from "./Text";

export interface RowProps extends Omit<PressableProps, "children"> {
  title: string;
  sub?: string;
  icon?: PhosphorIcon;
  /** A caret at the end shows the row opens something. */
  caret?: boolean;
  className?: string;
}

/** A 56 dp row: icon, title, sub line and a caret. Rows dim while pressed. */
export function Row({ title, sub, icon, caret = false, className, style, ...rest }: RowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      className={cn("flex-row items-center gap-3 px-4 py-2", className)}
      style={(state) => [{ minHeight: sizes.row }, dimOnPress(state), resolveStyle(style, state)]}
      {...rest}
    >
      {icon ? <Icon icon={icon} tone="muted" /> : null}
      <View className="flex-1">
        <Text variant="control" className="font-semibold">
          {title}
        </Text>
        {sub ? (
          <Text variant="meta" className="text-muted">
            {sub}
          </Text>
        ) : null}
      </View>
      {caret ? <Icon icon={CaretRight} size="sm" tone="muted" /> : null}
    </Pressable>
  );
}
