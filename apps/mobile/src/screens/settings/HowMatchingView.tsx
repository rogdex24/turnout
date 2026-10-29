import { ScrollView, View } from "react-native";
import { HOW_MATCHING_LEAD, HOW_MATCHING_SECTIONS, HOW_MATCHING_TITLE } from "@/content/howMatchingWorks";
import { BackBar } from "@/ui/BackBar";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";

/** Settings, how matching works: the page in `src/content/how-matching-works.md`, plain text, no links. */
export function HowMatchingView({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="settings-how-matching">
      <BackBar onBack={onBack} />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6">
        <View>
          <Text variant="title-large" accessibilityRole="header">
            {HOW_MATCHING_TITLE}
          </Text>
          <Text variant="body" className="mt-2 text-muted">
            {HOW_MATCHING_LEAD}
          </Text>
        </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}
