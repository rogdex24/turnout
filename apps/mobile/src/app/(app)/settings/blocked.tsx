// Board: B14.1
import { useRouter } from "expo-router";
import { BlockedScreen } from "@/screens/settings/BlockedScreen";

export default function SettingsBlocked() {
  const router = useRouter();
  return <BlockedScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
