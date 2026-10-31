import type { Gender } from "@turnout/contract/profile";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { profile } from "@/copy/profile";
import { type ProfileDraft, womenOnlyAvailable } from "@/model/profileForm";
import { BackBar } from "@/ui/BackBar";
import { PersonAvatar } from "@/ui/PersonAvatar";
import { Button } from "@/ui/primitives/Button";
import { Chip } from "@/ui/primitives/Chip";
import { Field } from "@/ui/primitives/Field";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Switch } from "@/ui/primitives/Switch";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";

/** Where the photo is: none yet, being drawn again after a pick, waiting to save, or going up. */
export type PhotoStatus = "idle" | "picking" | "picked" | "uploading";

/** A sentence per place a problem belongs, so it shows next to the thing to fix. `form` is for what has no field. */
export interface ProfileErrors {
  photo?: string;
  firstName?: string;
  gender?: string;
  handle?: string;
  womenOnly?: string;
  form?: string;
}

export interface ProfileViewProps {
  draft: ProfileDraft;
  /** The stored photo's link, or the file just picked. */
  photoUrl: string | null;
  photoStatus?: PhotoStatus;
  /** 0 to 1 while `photoStatus` is "uploading". */
  uploadFraction?: number;
  errors?: ProfileErrors;
  saving?: boolean;
  /** The last save went through: a short line above the button says so. */
  saved?: boolean;
  /** Settings has a way back; the onboarding step does not. */
  onBack?: () => void;
  onFirstName: (text: string) => void;
  onGender: (gender: Gender) => void;
  onHandle: (text: string) => void;
  onWomenOnly: (on: boolean) => void;
  onChangePhoto: () => void;
  onSave: () => void;
}

const GENDERS: readonly { value: Gender; label: string }[] = [
  { value: "woman", label: profile.gender.woman },
  { value: "man", label: profile.gender.man },
  { value: "non_binary", label: profile.gender.nonBinary },
];

function photoNote(status: PhotoStatus, fraction: number): string | null {
  if (status === "picking") return profile.photo.picking;
  if (status === "picked") return profile.photo.ready;
  if (status === "uploading") return profile.photo.uploading(Math.round(fraction * 100));
  return null;
}

/** The profile form, shared by onboarding and Settings: photo, first name, gender, handle, the women-only switch and a docked Save. */
export function ProfileView({
  draft,
  photoUrl,
  photoStatus = "idle",
  uploadFraction = 0,
  errors = {},
  saving = false,
  saved = false,
  onBack,
  onFirstName,
  onGender,
  onHandle,
  onWomenOnly,
  onChangePhoto,
  onSave,
}: ProfileViewProps) {
  const note = photoNote(photoStatus, uploadFraction);
  const busyPhoto = photoStatus === "picking" || photoStatus === "uploading";
  const womenOnly = draft.groupPref === "women_only";
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]} testID="profile">
      {onBack ? <BackBar onBack={onBack} /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6 pt-4" keyboardShouldPersistTaps="handled">
          <View>
            <Text variant="display" accessibilityRole="header">
              {profile.title}
            </Text>
            <Text variant="body" className="mt-2 text-muted">
              {profile.lead}
            </Text>
          </View>

          <View>
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={photoUrl ? profile.photo.change : profile.photo.add}
                disabled={busyPhoto || saving}
                onPress={onChangePhoto}
                testID="photo-tile"
              >
                <PersonAvatar name={draft.firstName.trim() || profile.photo.label} photoUrl={photoUrl} size="lg" />
              </Pressable>
              <View className="flex-1">
                <TextButton
                  title={photoUrl ? profile.photo.change : profile.photo.add}
                  link
                  disabled={busyPhoto || saving}
                  onPress={onChangePhoto}
                  className="self-start"
                  testID="photo-button"
                />
                {note ? (
                  <Text variant="meta" className="text-muted" accessibilityLiveRegion="polite" testID="photo-note">
                    {note}
                  </Text>
                ) : null}
              </View>
            </View>
            {photoStatus === "uploading" ? (
              <View
                className="mt-3 h-1 overflow-hidden rounded-pill bg-line"
                accessibilityRole="progressbar"
                accessibilityLabel={profile.photo.uploading(Math.round(uploadFraction * 100))}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(uploadFraction * 100) }}
                testID="photo-progress"
              >
                <View className="h-1 bg-ink" style={{ width: `${Math.round(uploadFraction * 100)}%` }} />
              </View>
            ) : null}
            <Text variant="meta" className="mt-2 text-muted">
              {profile.photo.hint}
            </Text>
            {errors.photo ? (
              <Text variant="meta" className="mt-2" accessibilityLiveRegion="polite" testID="photo-error">
                {errors.photo}
              </Text>
            ) : null}
          </View>

          <Field
            label={profile.firstName.label}
            value={draft.firstName}
            onChangeText={onFirstName}
            error={errors.firstName}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            editable={!saving}
            testID="first-name"
          />

          <View accessibilityRole="radiogroup" accessibilityLabel={profile.gender.label}>
            <Text variant="control" className="mb-2 font-semibold">
              {profile.gender.label}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {GENDERS.map(({ value, label }) => (
                <Chip
                  key={value}
                  label={label}
                  selected={draft.gender === value}
                  onPress={() => onGender(value)}
                  disabled={saving}
                  testID={`gender-${value}`}
                />
              ))}
            </View>
            {errors.gender ? (
              <Text variant="meta" className="mt-2" accessibilityLiveRegion="polite" testID="gender-error">
                {errors.gender}
              </Text>
            ) : null}
          </View>

          <Field
            label={profile.handle.label}
            help={profile.handle.why}
            error={errors.handle}
            value={draft.handleInput}
            onChangeText={onHandle}
            placeholder={profile.handle.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            editable={!saving}
            testID="handle"
          />

          {womenOnlyAvailable(draft) ? (
            <View className="rounded-card bg-surface px-4 py-3" testID="women-only-card">
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <Text variant="control" className="font-semibold" nativeID="women-only-title">
                    {profile.womenOnly.title}
                  </Text>
                  <Text variant="meta" className="mt-1 text-muted">
                    {profile.womenOnly.body}
                  </Text>
                </View>
                <Switch
                  value={womenOnly}
                  onValueChange={onWomenOnly}
                  disabled={saving}
                  accessibilityLabel={profile.womenOnly.title}
                  testID="women-only"
                />
              </View>
              {errors.womenOnly ? (
                <Text variant="meta" className="mt-2" accessibilityLiveRegion="polite" testID="women-only-error">
                  {errors.womenOnly}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View className="px-4 pb-3">
          {errors.form ? (
            <Text variant="meta" className="mb-3 text-center" accessibilityLiveRegion="polite" testID="form-error">
              {errors.form}
            </Text>
          ) : saved ? (
            <Text variant="meta" className="mb-3 text-center text-muted" accessibilityLiveRegion="polite" testID="saved">
              {profile.saved}
            </Text>
          ) : null}
          <Button title={profile.save} onPress={onSave} loading={saving} testID="save" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
