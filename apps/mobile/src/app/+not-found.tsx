// Board: B16.1
import { useRouter } from "expo-router";
import { Compass } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nav } from "@/copy/nav";
import { EmptyState } from "@/ui/EmptyState";

/** A link or a back stack that points nowhere: a plain sentence and the way to the shows. */
export default function NotFound() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 justify-center bg-bg" testID="not-found">
      <EmptyState
        icon={Compass}
        title={nav.notFound.title}
        body={nav.notFound.body}
        action={{ title: nav.notFound.action, onPress: () => router.replace("/") }}
      />
    </SafeAreaView>
  );
}
