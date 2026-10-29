import type { Plan } from "@turnout/contract/app/plans";
import { CalendarCheck } from "phosphor-react-native";
import { RefreshControl, ScrollView, View } from "react-native";
import { plans as copy } from "@/copy/plans";
import { groupPlans } from "@/model/plan";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { OfflineBar } from "@/ui/OfflineBar";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { SkeletonRow } from "@/ui/SkeletonRow";
import { PlanRow } from "./PlanRow";

export type PlansState =
  | { status: "loading" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  | { status: "ready"; plans: Plan[] };

export interface PlansViewProps {
  state: PlansState;
  offline?: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onOpenPlan: (planId: string) => void;
  /** The empty list's one way forward: back to the shows. */
  onFindShow: () => void;
}

function Section({ title, plans, onOpenPlan }: { title: string; plans: Plan[]; onOpenPlan: (planId: string) => void }) {
  if (plans.length === 0) return null;
  return (
    <View testID={`plans-${title.toLowerCase()}`}>
      <View className="flex-row items-baseline justify-between px-4 pb-1 pt-5">
        <Text variant="title-large" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="meta" tabular className="text-muted">
          {copy.count(plans.length)}
        </Text>
      </View>
      {plans.map((plan) => (
        <PlanRow key={plan.id} plan={plan} onPress={onOpenPlan} />
      ))}
    </View>
  );
}

/** The Plans tab: upcoming plans first, the nearest show on top, then the ones that ended. */
export function PlansView({ state, offline = false, refreshing = false, onRefresh, onRetry, onOpenPlan, onFindShow }: PlansViewProps) {
  const groups = state.status === "ready" ? groupPlans(state.plans) : null;
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]} testID="plans">
      <Text variant="display" className="px-4 pt-2" accessibilityRole="header">
        {copy.title}
      </Text>
      {offline ? <OfflineBar /> : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {state.status === "loading" ? (
          <View testID="plans-loading">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}
        {state.status === "error" ? <ErrorState kind={state.kind} onRetry={onRetry} /> : null}
        {groups && groups.upcoming.length + groups.past.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={copy.empty.title}
            body={copy.empty.body}
            action={{ title: copy.empty.action, onPress: onFindShow }}
          />
        ) : null}
        {groups ? (
          <>
            <Section title={copy.upcoming} plans={groups.upcoming} onOpenPlan={onOpenPlan} />
            <Section title={copy.past} plans={groups.past} onOpenPlan={onOpenPlan} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
