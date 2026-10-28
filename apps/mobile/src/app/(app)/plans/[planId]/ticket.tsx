// Board: B7.1
import { useLocalSearchParams, useRouter } from "expo-router";
import { TicketScreen } from "@/screens/ticket/TicketScreen";

export default function Ticket() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/plans"));
  return (
    <TicketScreen
      planId={planId}
      onBack={leave}
      onLater={leave}
      onDone={() => router.replace({ pathname: "/plans/[planId]", params: { planId } })}
      onPlan={() => router.replace({ pathname: "/plans/[planId]", params: { planId } })}
    />
  );
}
