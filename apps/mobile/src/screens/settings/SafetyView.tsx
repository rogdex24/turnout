import { View } from "react-native";
import { settings } from "@/copy/settings";
import { EmergencyCall } from "@/ui/EmergencyCall";
import { Text } from "@/ui/primitives/Text";
import { SettingsPage } from "./SettingsPage";

const copy = settings.safety;

export interface SafetyViewProps {
  onBack: () => void;
  /** Dials 112. */
  onCall: () => void;
}

/** Settings, safety and 112 (B14): Call 112 first, then what keeps a meet safe and what to do when it is not. Plain text, no links. */
export function SafetyView({ onBack, onCall }: SafetyViewProps) {
  return (
    <SettingsPage title={copy.title} lead={copy.lead} onBack={onBack} testID="settings-safety">
      <EmergencyCall onCall={onCall} testID="safety-sos" callTestID="safety-call-112" />
      {copy.sections.map((section) => (
        <View key={section.heading} className="gap-2">
          <Text variant="title" accessibilityRole="header">
            {section.heading}
          </Text>
          {section.items.map((item) => (
            <Text key={item} variant="body">
              {`•  ${item}`}
            </Text>
          ))}
        </View>
      ))}
    </SettingsPage>
  );
}
