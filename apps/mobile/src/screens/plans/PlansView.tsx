import { CalendarCheck } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { plans } from "@/copy/plans";
import { EmptyState } from "@/ui/EmptyState";
import { Text } from "@/ui/primitives/Text";

/** The Plans tab. M2 has no plans to show; the list lands with the Go with a group flow in M3. */
export function PlansView() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]} testID="plans">
      <Text variant="title-large" className="px-4 pt-4" accessibilityRole="header">
        {plans.title}
      </Text>
      <EmptyState icon={CalendarCheck} title={plans.emptyTitle} body={plans.emptyBody} />
    </SafeAreaView>
  );
}
