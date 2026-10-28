// Board: B5.1
import { useRouter } from "expo-router";
import { HomeScreen } from "@/screens/home/HomeScreen";

export default function Home() {
  const router = useRouter();
  return (
    <HomeScreen
      onOpenShow={(publicId) => router.push({ pathname: "/show/[publicId]", params: { publicId } })}
      onOpenPlan={(planId) => router.push({ pathname: "/plans/[planId]", params: { planId } })}
      onChangeHandle={() => router.push("/settings/social")}
    />
  );
}
