// Board: B16.1
import { typography } from "@turnout/design-tokens";
import { NativeTabs } from "expo-router/native-tabs";
import { nav } from "@/copy/nav";
import { useColors } from "@/ui/theme";

/**
 * Three native tabs: Shows, Plans, You. They are the system's own tab bar, so they take SF Symbols on iOS and Material symbols on
 * Android, not the Phosphor icons used inside screens.
 */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      tintColor={colors.ink}
      iconColor={{ default: colors.muted, selected: colors.ink }}
      labelStyle={{
        default: { color: colors.muted, fontSize: typography.label.fontSize },
        selected: { color: colors.ink, fontSize: typography.label.fontSize },
      }}
      indicatorColor={colors.surfaceRaised}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "ticket", selected: "ticket.fill" }} md="confirmation_number" />
        <NativeTabs.Trigger.Label>{nav.tabs.shows}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Icon sf={{ default: "calendar.badge.checkmark", selected: "calendar.badge.checkmark" }} md="event_available" />
        <NativeTabs.Trigger.Label>{nav.tabs.plans}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="you">
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
        <NativeTabs.Trigger.Label>{nav.tabs.you}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
