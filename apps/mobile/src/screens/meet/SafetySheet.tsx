import { Phone, SignOut } from "phosphor-react-native";
import { View } from "react-native";
import { meet as copy } from "@/copy/meet";
import { Row } from "@/ui/primitives/Row";
import { Sheet } from "@/ui/primitives/Sheet";

export interface SafetySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Dials 112. */
  onCall: () => void;
  /** Opens the way to leave the plan. Null while the plan is not known (the card opened offline before its plan was read). */
  onLeave: (() => void) | null;
}

/** B11.2. Call 112 is always first. Report and the group chat arrive with M4, so they are not here. */
export function SafetySheet({ visible, onClose, onCall, onLeave }: SafetySheetProps) {
  return (
    <Sheet visible={visible} title={copy.sheet.title} onClose={onClose} secondary={{ title: copy.sheet.close, onPress: onClose }}>
      <View className="overflow-hidden rounded-card border border-line bg-bg">
        <Row title={copy.sheet.call} icon={Phone} caret onPress={onCall} accessibilityLabel={copy.sheet.callLabel} testID="safety-call" />
        {onLeave ? (
          <>
            <View className="mx-4 h-px bg-line" />
            <Row title={copy.sheet.leave} icon={SignOut} caret onPress={onLeave} testID="safety-leave" />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
