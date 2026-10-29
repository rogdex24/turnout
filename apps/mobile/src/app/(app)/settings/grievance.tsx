// Board: B14.1
import { useRouter } from "expo-router";
import { GrievanceScreen } from "@/screens/settings/GrievanceScreen";

export default function SettingsGrievance() {
  const router = useRouter();
  return <GrievanceScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
