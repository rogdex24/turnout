import type { Plan } from "@turnout/contract/app/plans";
import { CaretRight } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { plans } from "@/copy/plans";
import { planStatus } from "@/model/planStatus";
import { istWhen } from "@/model/planTime";
import { Poster } from "@/ui/Poster";
import { Icon } from "@/ui/primitives/Icon";
import { dimOnPress } from "@/ui/primitives/press";
import { Text } from "@/ui/primitives/Text";
import { StatusStep } from "@/ui/StatusStep";
import { statusText } from "./statusLine";

export interface PlanRowProps {
  plan: Plan;
  onPress: (planId: string) => void;
}

/**
 * One plan in the list: a poster thumb, the show and its time, and where the plan stands. A plan that needs the person reads in
 * ink, bold, with a caret; a live search reads in signal; a plan that ended reads muted. A plan has no category, so the thumb is
 * the plain tone.
 */
export function PlanRow({ plan, onPress }: PlanRowProps) {
  const status = planStatus(plan);
  const text = statusText(status);
  const when = istWhen(plan.show.startsAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={plans.rowLabel(plan.show.title, when, text)}
      onPress={() => onPress(plan.id)}
      testID={`plan-row-${plan.id}`}
      className="flex-row items-center gap-3 px-4 py-3"
      style={dimOnPress}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Poster variant="thumb" title={plan.show.title} category="other" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="control" className="font-semibold">
          {plan.show.title}
        </Text>
        <Text variant="meta" tabular className="text-muted">
          {when}
        </Text>
        {status.tone === "action" ? (
          <Text variant="meta" className="font-semibold">
            {text}
          </Text>
        ) : (
          <StatusStep tone={status.tone === "live" ? "live" : status.tone === "ok" ? "done" : "waiting"}>{text}</StatusStep>
        )}
      </View>
      <Icon icon={CaretRight} size="sm" tone="muted" />
    </Pressable>
  );
}
