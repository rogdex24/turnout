// Board: B14.1
import { useRouter } from "expo-router";
import { NotificationsScreen } from "@/screens/settings/NotificationsScreen";

export default function SettingsNotifications() {
  const router = useRouter();
  return <NotificationsScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
