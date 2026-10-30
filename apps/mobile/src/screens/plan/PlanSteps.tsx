import { View } from "react-native";
import { plan as copy } from "@/copy/plan";
import type { StepState, PlanSteps as Steps } from "@/model/planSteps";
import { cn } from "@/ui/cn";
import { Text } from "@/ui/primitives/Text";
import { isLargeText, useFontScale } from "@/ui/textScale";

const LABELS = [copy.steps.ticket, copy.steps.group, copy.steps.meetCard] as const;

const BAR: Record<StepState, string> = {
  done: "bg-ink",
  now: "bg-ink",
  now_live: "bg-signal",
  pending: "bg-line",
  off: "bg-line",
};

const WORD: Record<StepState, string> = {
  done: copy.steps.done,
  now: copy.steps.current,
  now_live: copy.steps.current,
  pending: copy.steps.pending,
  off: copy.steps.off,
};

/**
 * The three steps of a plan as one bar: the ticket, the group, the meet card. Signal orange is only for the step that is live. At a
 * large text size a third of the width is too narrow for a label, so the steps stack and each bar sits beside its label.
 */
export function PlanSteps({ steps }: { steps: Steps }) {
  const large = isLargeText(useFontScale());
  const label = `${copy.steps.label}: ${steps.map((state, index) => `${LABELS[index]}, ${WORD[state]}`).join(". ")}`;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={large ? "gap-2" : "flex-row gap-2"}
      testID="plan-steps"
    >
      {steps.map((state, index) => (
        <View
          key={LABELS[index]}
          className={large ? "flex-row items-center gap-3" : "flex-1 gap-1.5"}
          accessible={false}
          testID="plan-step"
        >
          <View className={cn("h-1 rounded-pill", large && "w-8", BAR[state])} />
          <Text variant="meta" className={cn(large && "flex-1", state === "pending" || state === "off" ? "text-muted" : "font-semibold")}>
            {LABELS[index]}
          </Text>
        </View>
      ))}
    </View>
  );
}
