import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { notifications } from "@/copy/notifications";
import type { PushNative, PushPermission } from "./notifications";

function toPermission(response: Notifications.NotificationPermissionsStatus): PushPermission {
  return {
    status: response.granted ? "granted" : response.status === Notifications.PermissionStatus.DENIED ? "denied" : "undetermined",
    canAskAgain: response.canAskAgain,
  };
}

/** The phone's notification service: permission, the Expo token and the Android channels. Jest swaps this module for a fake. */
export const nativePush: PushNative = {
  platform: Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "other",
  async permission() {
    return toPermission(await Notifications.getPermissionsAsync());
  },
  async requestPermission() {
    return toPermission(await Notifications.requestPermissionsAsync());
  },
  async expoToken() {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(typeof projectId === "string" ? { projectId } : undefined);
    return data;
  },
  onTap(handler) {
    // The tap that started the app was handled before the listener existed, so it is read once and cleared.
    const first = Notifications.getLastNotificationResponse();
    if (first) {
      Notifications.clearLastNotificationResponse();
      handler(first.notification.request.content.data);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handler(response.notification.request.content.data);
    });
    return () => subscription.remove();
  },
  setForegroundHandler(decide) {
    Notifications.setNotificationHandler({ handleNotification: (notification) => decide(notification.request.content.data) });
  },
  async setUpChannels() {
    if (Platform.OS !== "android") return;
    const { channels } = notifications;
    // `plans` is the default for pushes that name no channel, so it is made first.
    await Notifications.setNotificationChannelAsync("plans", {
      name: channels.plans.name,
      description: channels.plans.description,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync("show-day", {
      name: channels.showDay.name,
      description: channels.showDay.description,
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync("thread", {
      name: channels.thread.name,
      description: channels.thread.description,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  },
};

/** Takes every delivered notification off the lock screen and the badge off the icon. They name the group and the show, so sign-out does not leave them. */
export async function clearDeliveredNotifications(): Promise<void> {
  await Promise.allSettled([Notifications.dismissAllNotificationsAsync(), Notifications.setBadgeCountAsync(0)]);
}
