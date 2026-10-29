// Board: B8.1
import { useRouter } from "expo-router";
import { PlansScreen } from "@/screens/plans/PlansScreen";

export default function Plans() {
  const router = useRouter();
  return (
    <PlansScreen
      onOpenPlan={(planId) => router.push({ pathname: "/plans/[planId]", params: { planId } })}
      onFindShow={() => router.navigate("/")}
    />
  );
}
