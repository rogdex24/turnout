import { View } from "react-native";
import { settings } from "@/copy/settings";
import { Text } from "@/ui/primitives/Text";
import { SettingsPage } from "./SettingsPage";

const copy = settings.privacy;

export interface PrivacyViewProps {
  /** The version this person agreed to. */
  version: string;
  onBack: () => void;
}

/** Settings, privacy notice: the text the person agreed to, in the app, with its version. */
export function PrivacyView({ version, onBack }: PrivacyViewProps) {
  return (
    <SettingsPage
      title={copy.title}
      lead={
        <Text variant="meta" className="mt-1 text-muted" testID="privacy-version">
          {copy.version(version)}
        </Text>
      }
      onBack={onBack}
      testID="settings-privacy"
    >
      <View className="gap-4">
        {copy.paragraphs.map((paragraph) => (
          <Text key={paragraph} variant="body">
            {paragraph}
          </Text>
        ))}
      </View>
    </SettingsPage>
  );
}
