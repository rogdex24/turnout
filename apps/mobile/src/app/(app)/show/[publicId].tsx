// Board: B6.1
import { useLocalSearchParams, useRouter } from "expo-router";
import { ShowScreen } from "@/screens/show/ShowScreen";

export default function Show() {
  const router = useRouter();
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  return (
    <ShowScreen
      publicId={publicId}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onSeeShows={() => router.replace("/")}
      onGo={(id) => router.push({ pathname: "/show/[publicId]/go", params: { publicId: id } })}
    />
  );
}
