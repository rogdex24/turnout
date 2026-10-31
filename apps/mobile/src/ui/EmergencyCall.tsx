import { Phone } from "phosphor-react-native";
import { View } from "react-native";
import { common } from "@/copy/common";
import { cn } from "./cn";
import { Button } from "./primitives/Button";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";

export interface EmergencyCallProps {
  /** Dials 112. */
  onCall: () => void;
  testID: string;
  callTestID: string;
  /** The side margin. The report form sets it; a page that already pads its column passes none. */
  className?: string;
}

/** "In danger now? Call 112" with its button, at the top of the report form and the safety page so it is never looked for. */
export function EmergencyCall({ onCall, testID, callTestID, className }: EmergencyCallProps) {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={common.emergency.text}
      className={cn("flex-row items-center gap-3 rounded-field bg-surface-raised px-4 py-3", className)}
      testID={testID}
    >
      <Icon icon={Phone} size="sm" />
      <Text variant="control" className="flex-1 font-semibold">
        {common.emergency.text}
      </Text>
      <Button
        variant="secondary"
        title={common.emergency.button}
        accessibilityLabel={common.emergency.label}
        className="min-h-11 px-4"
        onPress={onCall}
        testID={callTestID}
      />
    </View>
  );
}
