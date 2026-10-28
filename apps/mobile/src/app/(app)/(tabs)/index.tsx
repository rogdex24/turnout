// Board: B5.1
import { useRouter } from "expo-router";
import { HomeScreen } from "@/screens/home/HomeScreen";

export default function Home() {
  const router = useRouter();
  return (
    <HomeScreen
      onOpenShow={(publicId) => router.push({ pathname: "/show/[publicId]", params: { publicId } })}
      onChangeHandle={() => router.push("/settings/social")}
    />
  );
}
