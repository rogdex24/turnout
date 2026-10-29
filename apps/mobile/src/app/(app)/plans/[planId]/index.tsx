// Board: B9.1
import { useLocalSearchParams, useRouter } from "expo-router";
import { PlanScreen } from "@/screens/plan/PlanScreen";

export default function PlanDetail() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/plans"));
  return (
    <PlanScreen
      planId={planId}
      onBack={leave}
      onAddTicket={() => router.push({ pathname: "/plans/[planId]/ticket", params: { planId } })}
      onOpenMeetCard={(groupId) => router.push(`/groups/${groupId}/meet`)}
      onLeave={() => router.push({ pathname: "/plans/[planId]/cancel", params: { planId } })}
      onFindShow={() => router.navigate("/")}
      onChangeHandle={() => router.push("/settings/social")}
      onPlans={() => router.replace("/plans")}
    />
  );
}
