import { View } from "react-native";
import { HOW_MATCHING_LEAD, HOW_MATCHING_SECTIONS, HOW_MATCHING_TITLE } from "@/content/howMatchingWorks";
import { Text } from "@/ui/primitives/Text";
import { SettingsPage } from "./SettingsPage";

/** Settings, how matching works: the page in `src/content/how-matching-works.md`, plain text, no links. */
export function HowMatchingView({ onBack }: { onBack: () => void }) {
  return (
    <SettingsPage title={HOW_MATCHING_TITLE} lead={HOW_MATCHING_LEAD} onBack={onBack} testID="settings-how-matching">
      {HOW_MATCHING_SECTIONS.map((section) => (
        <View key={section.heading} className="gap-2">
          <Text variant="title" accessibilityRole="header">
            {section.heading}
          </Text>
          {section.text ? <Text variant="body">{section.text}</Text> : null}
          {section.items?.map((item) => (
            <Text key={item} variant="body">
              {`•  ${item}`}
            </Text>
          ))}
        </View>
      ))}
    </SettingsPage>
  );
}
