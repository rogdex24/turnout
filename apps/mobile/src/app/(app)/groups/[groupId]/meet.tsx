// Board: B11.1
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { MeetScreen } from "@/screens/meet/MeetScreen";

export default function Meet() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <MeetScreen
      groupId={groupId}
      focused={isFocused}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onOpenShow={(eventId) => router.push({ pathname: "/show/[publicId]", params: { publicId: eventId } })}
      onLeave={(planId) => router.push({ pathname: "/plans/[planId]/cancel", params: { planId } })}
      onClosed={() => router.replace("/plans")}
    />
  );
}
