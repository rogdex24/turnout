import { useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { type PushPermission, permissionChanged } from "@/api/notifications";
import { nativePush } from "@/api/pushNative";
import { NotificationsView } from "./NotificationsView";

/**
 * Reads the phone's permission when the page opens and again each time the person comes back from the phone's settings. While the
 * system has never asked, the page offers the question itself: iOS lists no notification switch for an app that has not asked, so
 * the phone's settings alone could not turn them on.
 */
export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [permission, setPermission] = useState<PushPermission | null>(null);

  useEffect(() => {
    let live = true;
    const read = () => {
      nativePush
        .permission()
        .then((result) => live && setPermission(result))
        .catch(() => undefined);
    };
    read();
    const subscription = AppState.addEventListener("change", (state) => state === "active" && read());
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  const ask = async () => {
    try {
      setPermission(await nativePush.requestPermission());
      // The app layout registers this phone with the server again, so a fresh grant reaches it.
      permissionChanged();
    } catch {
      // A failed question leaves the page as it was; the phone's settings are still there.
    }
  };
  const mayAsk = permission?.status === "undetermined" && permission.canAskAgain;

  return (
    <NotificationsView
      permission={permission?.status ?? null}
      onBack={onBack}
      onOpenSettings={() => void Linking.openSettings()}
      onAsk={mayAsk ? () => void ask() : undefined}
    />
  );
}
