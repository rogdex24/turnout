import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signin } from "@/copy/signin";
import { BackBar } from "@/ui/BackBar";
import { Button } from "@/ui/primitives/Button";
import { Field } from "@/ui/primitives/Field";
import { Text } from "@/ui/primitives/Text";

export interface PhoneViewProps {
  /** The field as it is typed, already formatted. */
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  /** One sentence under the field, from `sendFailureText`. */
  error?: string | null;
  /** True when this phone has no WhatsApp app: the help line then says the code can go to another phone. */
  noWhatsApp?: boolean;
  /** Left out when there is nowhere to go back to. */
  onBack?: () => void;
}

/** The phone number step: a +91 field, the WhatsApp line and Send code docked above the keyboard. */
export function PhoneView({ value, onChangeText, onSend, sending = false, error = null, noWhatsApp = false, onBack }: PhoneViewProps) {
  const seedNumber = value.startsWith("+");
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="sign-in" edges={["top", "bottom"]}>
      {onBack ? <BackBar onBack={onBack} /> : <View className="h-14" />}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <View className="flex-1 px-5 pt-1">
          <Text variant="display" accessibilityRole="header">
            {signin.phone.title}
          </Text>
          <Text variant="body" className="mt-2 text-muted">
            {signin.phone.lead}
          </Text>
          <Field
            className="mt-7"
            label={signin.phone.label}
            help={noWhatsApp ? signin.phone.noWhatsApp : signin.phone.help}
            error={error}
            prefix={
              seedNumber ? null : (
                <View className="mr-4 h-full justify-center border-line border-r pr-3.5">
                  <Text variant="title" tabular className="text-muted" accessibilityLabel={signin.phone.prefixLabel}>
                    {signin.phone.prefix}
                  </Text>
                </View>
              )
            }
            value={value}
            onChangeText={onChangeText}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            editable={!sending}
            onSubmitEditing={onSend}
            testID="phone-input"
          />
        </View>
        <View className="px-4 pb-3">
          <Button title={signin.phone.send} onPress={onSend} loading={sending} testID="send-code" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
