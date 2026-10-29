import { useContext, useRef, useState } from "react";
import { Pressable, TextInput, type TextInputInstance, View } from "react-native";
import { AutoFocusContext } from "./autoFocus";
import { cn } from "./cn";
import { Text } from "./primitives/Text";

export interface CodeEntryProps {
  value: string;
  onChangeText: (digits: string) => void;
  /** How many boxes. Six for the sign-in code. */
  length?: number;
  /** The accessible name of the whole field, for example "6 digit code". */
  label: string;
  /** Said after the label as the person types, for example "3 of 6 entered". */
  progress: string;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * Boxes for a one-time code: one display numeral each, the next empty box ringed in ink. One see-through text input over the boxes takes the typing, the
 * paste and the keyboard's code suggestion, so a screen reader meets a single field and not six.
 */
export function CodeEntry({
  value,
  onChangeText,
  length = 6,
  label,
  progress,
  editable = true,
  autoFocus = false,
  testID,
}: CodeEntryProps) {
  const input = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const focusAllowed = useContext(AutoFocusContext);
  const digits = value.replace(/\D/g, "").slice(0, length);
  const next = Math.min(digits.length, length - 1);

  return (
    <View testID={testID}>
      <Pressable
        accessible={false}
        onPress={() => input.current?.focus()}
        className="flex-row gap-2"
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length }, (_, i) => (
          <View
            // The box count never changes, so the position is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: boxes are positional
            key={i}
            testID={testID ? `${testID}-box-${i}` : undefined}
            className={cn(
              "min-h-16 flex-1 items-center justify-center rounded-field border bg-surface",
              focused && editable && i === next ? "border-ink" : "border-outline",
            )}
          >
            <Text variant="display" tabular>
              {digits[i] ?? ""}
            </Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input}
        testID={testID ? `${testID}-input` : undefined}
        value={digits}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, "").slice(0, length))}
        editable={editable}
        autoFocus={autoFocus && focusAllowed}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={`${label}, ${progress}`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        underlineColorAndroid="transparent"
        // See-through rather than at zero opacity: iOS and Android leave a view at alpha 0 out of the accessibility tree, so
        // VoiceOver, TalkBack and the Maestro flows could not reach the field.
        className="absolute inset-0 bg-transparent text-transparent"
      />
    </View>
  );
}
