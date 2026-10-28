// Board: B3.2
import { useRouter } from "expo-router";
import { ProfileScreen } from "@/screens/profile/ProfileScreen";

export default function SettingsProfile() {
  const router = useRouter();
  return <ProfileScreen onBack={() => router.back()} />;
}
