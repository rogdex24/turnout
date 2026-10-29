// Board: B14.3
import { useRouter } from "expo-router";
import { DeleteAccountScreen } from "@/screens/settings/DeleteAccountScreen";

export default function SettingsDeleteAccount() {
  const router = useRouter();
  return <DeleteAccountScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
