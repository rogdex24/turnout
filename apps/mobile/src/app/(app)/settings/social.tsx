// Board: B4.1
import { useRouter } from "expo-router";
import { SocialScreen } from "@/screens/settings/SocialScreen";

export default function SettingsSocial() {
  const router = useRouter();
  return <SocialScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
