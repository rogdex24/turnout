import { WarningCircle } from "phosphor-react-native";
import { View } from "react-native";
import { plan as copy } from "@/copy/plan";
import { Note } from "@/ui/primitives/Note";
import { Sheet } from "@/ui/primitives/Sheet";

export interface CancelViewProps {
  /** The plan has a group: the one thing the group is told is said here. */
  hasGroup: boolean;
  busy?: boolean;
  /** Why the last try did not go through, already written. */
  issue?: string | null;
  onLeave: () => void;
  onStay: () => void;
}

/** "Leave this plan?" as a sheet over the plan. Plain: what happens, and one button each way. No guilt, and the ticket is said to be untouched. */
export function CancelView({ hasGroup, busy = false, issue = null, onLeave, onStay }: CancelViewProps) {
  return (
    <Sheet
      visible
      title={copy.cancel.title}
      lead={copy.cancel.lead}
      onClose={onStay}
      primary={{ title: copy.cancel.confirm, onPress: onLeave, loading: busy, testID: "cancel-confirm" }}
      secondary={{ title: copy.cancel.stay, onPress: onStay, testID: "cancel-stay" }}
    >
      <View className="gap-3" testID="cancel-sheet">
        {hasGroup ? <Note icon={WarningCircle}>{copy.cancel.groupNote}</Note> : null}
        {issue ? (
          <View accessibilityLiveRegion="polite" testID="cancel-issue">
            <Note icon={WarningCircle}>{issue}</Note>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
