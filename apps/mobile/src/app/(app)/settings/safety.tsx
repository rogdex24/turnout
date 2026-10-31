// Board: B14.1
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { SafetyView } from "@/screens/settings/SafetyView";

const EMERGENCY_URL = "tel:112";

export default function SettingsSafety() {
  const router = useRouter();
  return (
    <SafetyView
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onCall={() => void Linking.openURL(EMERGENCY_URL).catch(() => undefined)}
    />
  );
}
