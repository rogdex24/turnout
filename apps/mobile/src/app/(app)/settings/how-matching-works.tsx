// Board: B14.1
import { useRouter } from "expo-router";
import { HowMatchingView } from "@/screens/settings/HowMatchingView";

export default function SettingsHowMatchingWorks() {
  const router = useRouter();
  return <HowMatchingView onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
