import { sizes } from "@turnout/design-tokens";
import { type ComponentRef, type ReactNode, type Ref, useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { cn } from "../cn";
import { useColors } from "../theme";
import { Text } from "./Text";

/** What a ref to the field's input holds: `focus()`, `blur()` and the rest. */
export type FieldInput = ComponentRef<typeof TextInput>;

export interface FieldProps extends Omit<TextInputProps, "style"> {
  /** The label above the field, also the accessible name. */
  label: string;
  /** Help below the field, in muted text. */
  help?: string;
  /** An error replaces the help. It is not red: the border stays ink and the words say what to do. */
  error?: string | null;
  /** Content before the input, such as the +91 prefix. */
  prefix?: ReactNode;
  /** The text input itself, for a screen that moves focus to it. */
  inputRef?: Ref<FieldInput>;
  className?: string;
}

/** A 56 dp text field: label above, outline border, help or error below. */
export function Field({ label, help, error, prefix, inputRef, className, onFocus, onBlur, ...input }: FieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const below = error ?? help;
  return (
    <View className={className}>
      <Text variant="control" className="mb-2 font-semibold">
        {label}
      </Text>
      <View
        className={cn("flex-row items-center rounded-field border bg-surface px-4", focused || error ? "border-ink" : "border-outline")}
        style={{ minHeight: sizes.field }}
      >
        {prefix}
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={below ?? undefined}
          placeholderTextColor={colors.muted}
          selectionColor={colors.ink}
          cursorColor={colors.ink}
          allowFontScaling
          className="flex-1 py-0 font-sans text-title text-ink"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...input}
        />
      </View>
      {below ? (
        <Text variant="meta" className={cn("mt-2", error ? "text-ink" : "text-muted")} accessibilityLiveRegion={error ? "polite" : "none"}>
          {below}
        </Text>
      ) : null}
    </View>
  );
}
