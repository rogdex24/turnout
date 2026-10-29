import { useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import type { PushPermission } from "@/api/notifications";
import { nativePush } from "@/api/pushNative";
import { NotificationsView } from "./NotificationsView";

/** Reads the phone's permission when the page opens and again each time the person comes back from the phone's settings. */
export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [permission, setPermission] = useState<PushPermission["status"] | null>(null);

  useEffect(() => {
    let live = true;
    const read = () => {
      nativePush
        .permission()
        .then((result) => live && setPermission(result.status))
        .catch(() => undefined);
    };
    read();
    const subscription = AppState.addEventListener("change", (state) => state === "active" && read());
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  return <NotificationsView permission={permission} onBack={onBack} onOpenSettings={() => void Linking.openSettings()} />;
}
