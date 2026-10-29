import { ScrollView, View } from "react-native";
import { settings } from "@/copy/settings";
import { BackBar } from "@/ui/BackBar";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";

const copy = settings.privacy;

export interface PrivacyViewProps {
  /** The version this person agreed to. */
  version: string;
  onBack: () => void;
}

/** Settings, privacy notice: the text the person agreed to, in the app, with its version. */
export function PrivacyView({ version, onBack }: PrivacyViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="settings-privacy">
      <BackBar onBack={onBack} />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pb-6">
        <View>
          <Text variant="title-large" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="meta" className="mt-1 text-muted" testID="privacy-version">
            {copy.version(version)}
          </Text>
        </View>
        {copy.paragraphs.map((paragraph) => (
          <Text key={paragraph} variant="body">
            {paragraph}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
