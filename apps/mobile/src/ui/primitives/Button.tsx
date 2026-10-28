import { pressed } from "@turnout/design-tokens";
import { cva, type VariantProps } from "class-variance-authority";
import { Pressable, type PressableProps } from "react-native";
import { cn } from "../cn";
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
  className?: string;
}

/** The pill button: 56 dp tall when primary, 48 when secondary, shrinks a little while pressed. */
export function Button({ title, variant, className, disabled, style, ...rest }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={cn(button({ variant, disabled: !!disabled }), className)}
      style={(state) => [
        state.pressed ? { transform: [{ scale: pressed.scale }] } : null,
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      <Text variant="control" className={label({ variant })}>
        {title}
      </Text>
    </Pressable>
  );
}
