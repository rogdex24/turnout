import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { BackBar } from "@/ui/BackBar";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";

export interface SettingsPageProps {
  title: string;
  /** A string is the muted line under the title. An element takes its place as given. */
  lead: ReactNode;
  onBack: () => void;
  testID: string;
  /** Fixed below the scroll, for the page's one action. */
  footer?: ReactNode;
  children: ReactNode;
}

/** The frame every settings page shares: back, a scrolling column with the title and lead first, and an optional footer. */
export function SettingsPage({ title, lead, onBack, testID, footer, children }: SettingsPageProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID={testID}>
      <BackBar onBack={onBack} />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6" keyboardShouldPersistTaps="handled">
        <View>
          <Text variant="title-large" accessibilityRole="header">
            {title}
          </Text>
          {typeof lead === "string" ? (
            <Text variant="body" className="mt-2 text-muted">
              {lead}
            </Text>
          ) : (
            lead
          )}
        </View>
        {children}
      </ScrollView>
      {footer ? <View className="border-t border-line bg-bg px-4 pb-3 pt-3">{footer}</View> : null}
    </SafeAreaView>
  );
}
