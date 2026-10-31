// Board: B13.1
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { AfterScreen } from "@/screens/after/AfterScreen";
import { useBlockCapture } from "@/ui/useBlockCapture";

export default function After() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  useBlockCapture();
  return (
    <AfterScreen
      groupId={groupId}
      focused={isFocused}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onReport={(id, memberRef) => router.push({ pathname: "/report", params: { groupId: id, memberRef } })}
      onClosed={() => router.replace("/plans")}
    />
  );
}
