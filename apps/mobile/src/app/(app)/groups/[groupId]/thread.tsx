// Board: B12
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { ThreadScreen } from "@/screens/thread/ThreadScreen";
import { useBlockCapture } from "@/ui/useBlockCapture";

export default function Thread() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  useBlockCapture();
  return (
    <ThreadScreen
      groupId={groupId}
      focused={isFocused}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onReport={({ memberRef, messageId }) => router.push({ pathname: "/report", params: { groupId, memberRef, messageId } })}
      onClosed={() => router.replace("/plans")}
    />
  );
}
