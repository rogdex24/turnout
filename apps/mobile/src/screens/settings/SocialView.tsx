import type { HandleKind, HandleRejectReason, HandleState } from "@turnout/contract/profile";
import type { Ref } from "react";
import { View } from "react-native";
import { profileCheck } from "@/copy/profileCheck";
import { ProfileCheckStrip } from "@/ui/ProfileCheckStrip";
import { Button } from "@/ui/primitives/Button";
import { Field, type FieldInput } from "@/ui/primitives/Field";
import { Text } from "@/ui/primitives/Text";
import { SettingsPage } from "./SettingsPage";

const copy = profileCheck.social;

/** The handle as the account holds it. `state` is null for an account that has none yet. */
export interface HeldHandle {
  state: HandleState | null;
  kind: HandleKind | null;
  handle: string | null;
  rejectReason: HandleRejectReason | null;
}

export interface SocialViewProps {
  held: HeldHandle;
  input: string;
  /** Why the last try did not go through, written next to the field. */
  error?: string | null;
  saving?: boolean;
  /** The new handle was sent and the strip is back to checking. */
  saved?: boolean;
  /** The strip appears now because of a change the person just made, so it is said aloud. */
  announceStrip?: boolean;
  inputRef?: Ref<FieldInput>;
  onBack: () => void;
  onInput: (text: string) => void;
  onSave: () => void;
  /** The strip's own "Change handle": takes the person to the field. */
  onChangeHandle: () => void;
}

/**
 * Settings, Instagram or LinkedIn. The strip says where the check stands; nothing here blocks a route. An approved handle has no
 * strip. A new handle goes back to checking in place, and the field stays so it can be changed again.
 */
export function SocialView({
  held,
  input,
  error,
  saving = false,
  saved = false,
  announceStrip = false,
  inputRef,
  onBack,
  onInput,
  onSave,
  onChangeHandle,
}: SocialViewProps) {
  const current = held.handle ? `${held.kind ? `${copy.kind[held.kind]}, ` : ""}${held.handle}` : copy.none;
  return (
    <SettingsPage
      title={copy.title}
      lead={copy.lead}
      onBack={onBack}
      testID="settings-social"
      footer={<Button title={copy.save} onPress={onSave} loading={saving} disabled={input.trim() === ""} testID="social-save" />}
    >
      {held.state === "pending" ? <ProfileCheckStrip state="pending" announceOnMount={announceStrip} /> : null}
      {held.state === "rejected" ? (
        <ProfileCheckStrip state="rejected" reason={held.rejectReason} onChange={onChangeHandle} announceOnMount={announceStrip} />
      ) : null}

      <View accessible accessibilityLabel={`${copy.current}, ${current}`} testID="social-current">
        <Text variant="label" className="text-muted">
          {copy.current}
        </Text>
        <Text variant="control" className="mt-1 font-semibold">
          {current}
        </Text>
      </View>

      <Field
        inputRef={inputRef}
        label={copy.field}
        error={error}
        value={input}
        onChangeText={onInput}
        placeholder={copy.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="url"
        editable={!saving}
        testID="social-handle"
      />
      {saved && !error ? (
        <Text variant="meta" className="-mt-3 text-muted" accessibilityLiveRegion="polite" testID="social-saved">
          {copy.saved}
        </Text>
      ) : null}
    </SettingsPage>
  );
}
