import type { HandleRejectReason } from "@turnout/contract/profile";
import { HourglassMedium, Info } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { profileCheck } from "@/copy/profileCheck";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";
import { TextButton } from "./primitives/TextButton";

export type ProfileCheckStripProps = (
  | { state: "pending" }
  | { state: "rejected"; reason: HandleRejectReason | null; onChange: () => void }
) & {
  /** Say the strip out loud as it first appears, for a strip that appears because the person just changed their handle. */
  announceOnMount?: boolean;
};

/** The sentence a strip shows: one per state, and for a turned-down handle one per reason. */
export function checkMessage(props: ProfileCheckStripProps): string {
  return props.state === "rejected" ? profileCheck.rejected[props.reason ?? "unknown"] : profileCheck.pending;
}

/**
 * The strip under the area pills while the handle is being checked or was turned down. Neutral and raised, never red. The check
 * never blocks a route, so the strip is information with at most one way forward. A handle that is approved has no strip: there is
 * nothing to say. A change of state is said once: Android reads the live region, iOS has none, so it is announced there.
 */
export function ProfileCheckStrip(props: ProfileCheckStripProps) {
  const rejected = props.state === "rejected";
  const message = checkMessage(props);
  const said = useRef<string | null>(props.announceOnMount ? null : message);
  useEffect(() => {
    if (said.current === message) return;
    said.current = message;
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
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
