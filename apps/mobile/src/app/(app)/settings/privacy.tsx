// Board: B14.1
import { useRouter } from "expo-router";
import { PrivacyScreen } from "@/screens/settings/PrivacyScreen";

export default function SettingsPrivacy() {
  const router = useRouter();
  return <PrivacyScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
