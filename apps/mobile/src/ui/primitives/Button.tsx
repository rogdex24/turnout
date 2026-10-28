import { cva, type VariantProps } from "class-variance-authority";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import { cn } from "../cn";
import { useColors } from "../theme";
import { Icon } from "./Icon";
import { resolveStyle, scaleOnPress } from "./press";
import { Text } from "./Text";

const button = cva("items-center justify-center rounded-pill px-6", {
  variants: {
    variant: {
      primary: "h-14 bg-primary",
      secondary: "h-12 border border-outline bg-transparent",
    },
    disabled: { true: "opacity-40", false: "" },
  },
  defaultVariants: { variant: "primary", disabled: false },
});

const label = cva("", {
  variants: { variant: { primary: "text-on-primary", secondary: "text-ink" } },
  defaultVariants: { variant: "primary" },
});

export interface ButtonProps extends Omit<PressableProps, "children" | "disabled">, Pick<VariantProps<typeof button>, "variant"> {
  /** The visible label, also the accessibility label. */
  title: string;
  disabled?: boolean;
  /** Work is under way: the label stays, a spinner shows, and a second press does nothing. */
  loading?: boolean;
  /** An icon before the label. */
  icon?: PhosphorIcon;
  className?: string;
}

/** The pill button: 56 dp tall when primary, 48 when secondary, shrinks a little while pressed. */
export function Button({ title, variant, className, disabled, loading = false, icon, style, ...rest }: ButtonProps) {
  const colors = useColors();
  const off = !!disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      className={cn(button({ variant, disabled: !!disabled }), className)}
      style={(state) => [scaleOnPress(state), resolveStyle(style, state)]}
      {...rest}
    >
      <View className="flex-row items-center justify-center gap-2">
        {loading ? <ActivityIndicator color={variant === "secondary" ? colors.ink : colors.onPrimary} /> : null}
        {icon && !loading ? <Icon icon={icon} size="sm" tone={variant === "secondary" ? "ink" : "onPrimary"} /> : null}
        <Text variant="control" className={label({ variant })}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
