import { View } from "react-native";
import type { PushPermission } from "@/api/notifications";
import { notifications } from "@/copy/notifications";
import { settings } from "@/copy/settings";
import { Button } from "@/ui/primitives/Button";
import { Text } from "@/ui/primitives/Text";
import { SettingsPage } from "./SettingsPage";

const copy = settings.notifications;

export interface NotificationsViewProps {
  /** Null while the phone is being asked. */
  permission: PushPermission["status"] | null;
  onBack: () => void;
  onOpenSettings: () => void;
  /** Asks the system's question. Only while it has never been asked. */
  onAsk?: () => void;
}

/** Settings, notifications: whether this phone lets Turnout notify, what the three kinds are, and the way to the phone's own settings. */
export function NotificationsView({ permission, onBack, onOpenSettings, onAsk }: NotificationsViewProps) {
  return (
    <SettingsPage title={copy.title} lead={copy.lead} onBack={onBack} testID="settings-notifications">
      {permission ? (
        <View
          className="rounded-field bg-surface px-4 py-3"
          accessible
          accessibilityLabel={`${copy.status.label}, ${copy.status[permission]}. ${copy.hint[permission]}`}
          testID="notifications-status"
        >
          <Text variant="label" className="text-muted">
            {copy.status.label}
          </Text>
          <Text variant="control" className="mt-1 font-semibold">
            {copy.status[permission]}
          </Text>
          <Text variant="meta" className="mt-1 text-muted">
            {copy.hint[permission]}
          </Text>
        </View>
      ) : null}

      <View className="gap-3">
        <Text variant="title" accessibilityRole="header">
          {copy.channelsTitle}
        </Text>
        {Object.values(notifications.channels).map((channel) => (
          <View key={channel.name} accessible accessibilityLabel={`${channel.name}, ${channel.description}`}>
            <Text variant="control" className="font-semibold">
              {channel.name}
            </Text>
            <Text variant="meta" className="text-muted">
              {channel.description}
            </Text>
          </View>
        ))}
      </View>

      {onAsk ? <Button title={copy.ask} onPress={onAsk} testID="notifications-ask" /> : null}
      <Button variant="secondary" title={copy.openSettings} onPress={onOpenSettings} testID="notifications-open-settings" />
    </SettingsPage>
  );
}
