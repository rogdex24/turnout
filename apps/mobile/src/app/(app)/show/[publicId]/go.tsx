// Board: B6.2
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { GoScreen } from "@/screens/go/GoScreen";

/** A sheet over the Show page: the route is a transparent modal, so the show stays behind the scrim. */
export default function Go() {
  const router = useRouter();
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: "transparentModal", animation: "none" }} />
      <GoScreen
        publicId={publicId}
        onClose={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/show/[publicId]", params: { publicId } }))}
        onPlan={(planId) => router.replace({ pathname: "/plans/[planId]/ticket", params: { planId } })}
        onFinish={(to) => router.replace(to)}
      />
    </>
  );
}
