import { ClipboardText, WhatsappLogo } from "phosphor-react-native";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signin } from "@/copy/signin";
import { OTP } from "@/model/otpFlow";
import { BackBar } from "@/ui/BackBar";
import { CodeEntry } from "@/ui/CodeEntry";
import { Button } from "@/ui/primitives/Button";
import { Note } from "@/ui/primitives/Note";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";

export interface CodeViewProps {
  /** The number the code went to, as it reads on screen: "+91 55501 00123". */
  phoneLabel: string;
  value: string;
  onChangeText: (digits: string) => void;
  /** The code is being checked: the boxes are held and the screen says so. */
  checking?: boolean;
  /** A new code is being sent. */
  resending?: boolean;
  /** One sentence under the boxes: a wrong code, a limit, a refusal. */
  message?: string | null;
  /** The number is not on WhatsApp: the boxes give way to a note and Change number is the only action. */
  notOnWhatsApp?: boolean;
  /** The minute has passed (or the code was cancelled): show "Not there yet? Send again". */
  askAgain?: boolean;
  /** Seconds until Send again works; 0 when it works now. */
  resendInSeconds?: number;
  onSendAgain: () => void;
  onPaste: () => void;
  onChangeNumber: () => void;
  onBack: () => void;
}

/** The code step: six boxes, Change number, Paste, and after a minute "Not there yet? Send again". Typing and paste always work. */
export function CodeView({
  phoneLabel,
  value,
  onChangeText,
  checking = false,
  resending = false,
  message = null,
  notOnWhatsApp = false,
  askAgain = false,
  resendInSeconds = 0,
  onSendAgain,
  onPaste,
  onChangeNumber,
  onBack,
}: CodeViewProps) {
  const entered = value.length;
  const line = checking ? signin.code.checking : resending ? signin.code.resending : message;
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="code" edges={["top", "bottom"]}>
      <BackBar onBack={onBack} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="px-5 pt-1" keyboardShouldPersistTaps="handled">
          {notOnWhatsApp ? (
            <>
              <Text variant="display" accessibilityRole="header">
                {signin.code.notOnWhatsApp.title}
              </Text>
              <Note icon={WhatsappLogo} className="mt-5">
                {signin.code.notOnWhatsApp.body}
              </Note>
              <Button title={signin.code.changeNumber} onPress={onChangeNumber} className="mt-6" testID="change-number" />
            </>
          ) : (
            <>
              <Text variant="display" accessibilityRole="header">
                {signin.code.title}
              </Text>
              <Text variant="body" tabular className="mt-2 text-muted">
                {signin.code.lead(phoneLabel)}
              </Text>
              <TextButton
                link
                title={signin.code.changeNumber}
                onPress={onChangeNumber}
                className="-ml-3 self-start"
                testID="change-number"
              />
              <View className="mt-5">
                <CodeEntry
                  value={value}
                  onChangeText={onChangeText}
                  length={OTP.codeLength}
                  label={signin.code.codeLabel}
                  progress={signin.code.codeProgress(entered, OTP.codeLength)}
                  editable={!checking}
                  autoFocus
                  testID="code-field"
                />
              </View>
              {line ? (
                <Text variant="meta" className="mt-3" accessibilityLiveRegion="polite" testID="code-message">
                  {line}
                </Text>
              ) : null}
              <View className="mt-4 -mr-3 flex-row items-center justify-between">
                {askAgain ? (
                  <View className="flex-row items-center">
                    <Text variant="body" className="text-muted">
                      {signin.code.notThereYet}
                    </Text>
                    <TextButton
                      title={resendInSeconds > 0 ? signin.code.sendAgainIn(resendInSeconds) : signin.code.sendAgain}
                      onPress={onSendAgain}
                      disabled={resendInSeconds > 0 || resending || checking}
                      className="pl-2"
                      testID="send-again"
                    />
                  </View>
                ) : (
                  <View />
                )}
                <TextButton icon={ClipboardText} title={signin.code.paste} onPress={onPaste} disabled={checking} testID="paste-code" />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
