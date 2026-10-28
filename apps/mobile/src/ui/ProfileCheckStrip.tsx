import type { HandleRejectReason } from "@turnout/contract/profile";
import { HourglassMedium, Info } from "phosphor-react-native";
import { View } from "react-native";
import { profileCheck } from "@/copy/profileCheck";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";
import { TextButton } from "./primitives/TextButton";

export type ProfileCheckStripProps = { state: "pending" } | { state: "rejected"; reason: HandleRejectReason | null; onChange: () => void };

/**
 * The strip under the area pills while the handle is being checked or was turned down. Neutral and raised, never red. The check
 * never blocks a route, so the strip is information with at most one way forward. It is announced politely when it appears.
 */
export function ProfileCheckStrip(props: ProfileCheckStripProps) {
  const rejected = props.state === "rejected";
  const message = rejected ? profileCheck.rejected[props.reason ?? "unknown"] : profileCheck.pending;
  return (
    <View
      accessible={!rejected}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={rejected ? undefined : message}
      testID="profile-check-strip"
      className="flex-row items-center gap-3 rounded-field bg-surface-raised px-4 py-3"
    >
      <Icon icon={rejected ? Info : HourglassMedium} size="sm" tone="muted" />
      <Text variant="body" className="flex-1">
        {message}
      </Text>
      {rejected ? <TextButton link title={profileCheck.change} onPress={props.onChange} className="-my-3" /> : null}
    </View>
  );
}
