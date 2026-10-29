// Board: B10.1
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CancelScreen } from "@/screens/plan/CancelScreen";

/** A sheet over the plan: a transparent modal, so the plan stays behind the scrim. */
export default function Cancel() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: "transparentModal", animation: "none" }} />
      <CancelScreen
        planId={planId}
        onClose={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/plans/[planId]", params: { planId } }))}
      />
    </>
  );
}
