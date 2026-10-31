import { Info } from "phosphor-react-native";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { deleteAccount } from "@/copy/deleteAccount";
import { signin } from "@/copy/signin";
import { OTP } from "@/model/otpFlow";
import { BackBar } from "@/ui/BackBar";
import { CodeEntry } from "@/ui/CodeEntry";
import { Button } from "@/ui/primitives/Button";
import { Note } from "@/ui/primitives/Note";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";

const copy = deleteAccount;

export type DeleteStep = "explain" | "confirm" | "code";

export interface DeleteAccountViewProps {
  step: DeleteStep;
  /** The last four digits of the number the code goes to; empty when the account does not say. */
  last4: string;
  /** A plan is in the last 3 hours (or under way) with a group, so leaving tells the group someone left. */
  groupWillBeTold: boolean;
  code: string;
  onCodeChange: (digits: string) => void;
  /** The code is being sent. */
  sending?: boolean;
  /** The code was sent and the account is being deleted. */
  deleting?: boolean;
  /** One sentence: a wrong code, a limit, a failed send. */
  message?: string | null;
  onContinue: () => void;
  onSend: () => void;
  onSendAgain: () => void;
  /** Leaves the flow with the account untouched. */
  onKeep: () => void;
  onBack: () => void;
}

/**
 * Delete account, in three steps on one route. Explain: what goes and what stays, from the data map. Confirm: one plain question and
 * the number the code goes to. Code: the six digits from WhatsApp. Keeping the account is always one tap and worded as a neutral choice.
 */
export function DeleteAccountView({
  step,
  last4,
  groupWillBeTold,
  code,
  onCodeChange,
  sending = false,
  deleting = false,
  message = null,
  onContinue,
  onSend,
  onSendAgain,
  onKeep,
  onBack,
}: DeleteAccountViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="settings-delete-account" edges={["top", "bottom"]}>
      <BackBar onBack={onBack} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6" keyboardShouldPersistTaps="handled">
          {step === "explain" ? (
            <>
              <View testID="delete-explain">
                <Text variant="title-large" accessibilityRole="header">
                  {copy.title}
                </Text>
                <Text variant="body" className="mt-2 text-muted">
                  {copy.lead}
                </Text>
              </View>
              <List title={copy.erasedTitle} items={copy.erased} testID="delete-erased" />
              <List title={copy.keptTitle} items={copy.kept} testID="delete-kept" />
              {groupWillBeTold ? (
                <Note icon={Info} className="mt-1">
                  {copy.groupTold}
                </Note>
              ) : null}
              <Button title={copy.continue} onPress={onContinue} testID="delete-continue" />
            </>
          ) : null}

          {step === "confirm" ? (
            <>
              <View testID="delete-confirm">
                <Text variant="title-large" accessibilityRole="header">
                  {copy.confirm.title}
                </Text>
                <Text variant="body" className="mt-2 text-muted">
                  {copy.confirm.body(last4)}
                </Text>
              </View>
              {groupWillBeTold ? <Note icon={Info}>{copy.groupTold}</Note> : null}
              {message ? (
                <Text variant="meta" accessibilityLiveRegion="polite" testID="delete-message">
                  {message}
                </Text>
              ) : null}
              <View className="gap-3">
                <Button title={copy.confirm.send} onPress={onSend} loading={sending} testID="delete-send" />
                <Button variant="secondary" title={copy.confirm.keep} onPress={onKeep} disabled={sending} testID="delete-keep" />
              </View>
            </>
          ) : null}

          {step === "code" ? (
            <>
              <View testID="delete-code">
                <Text variant="title-large" accessibilityRole="header">
                  {copy.code.title}
                </Text>
                <Text variant="body" className="mt-2 text-muted">
                  {copy.code.lead(last4)}
                </Text>
              </View>
              <CodeEntry
                value={code}
                onChangeText={onCodeChange}
                length={OTP.codeLength}
                label={signin.code.codeLabel}
                progress={signin.code.codeProgress(code.length, OTP.codeLength)}
                editable={!deleting}
                autoFocus
                testID="delete-code-field"
              />
              {deleting || message ? (
                <Text variant="meta" accessibilityLiveRegion="polite" testID="delete-message">
                  {deleting ? copy.code.deleting : message}
                </Text>
              ) : null}
              <View className="items-start">
                <TextButton
                  title={copy.code.resend}
                  onPress={onSendAgain}
                  disabled={deleting || sending}
                  className="-ml-3"
                  testID="delete-resend"
                />
                <TextButton title={copy.code.change} onPress={onKeep} disabled={deleting} className="-ml-3" testID="delete-keep" />
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function List({ title, items, testID }: { title: string; items: readonly string[]; testID: string }) {
  return (
    <View className="gap-2" testID={testID}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {items.map((item) => (
        <Text key={item} variant="body">
          {`•  ${item}`}
        </Text>
      ))}
    </View>
  );
}
