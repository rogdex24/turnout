import { View } from "react-native";
import { plan as copy } from "@/copy/plan";
import type { StepState, PlanSteps as Steps } from "@/model/planSteps";
import { cn } from "@/ui/cn";
import { Text } from "@/ui/primitives/Text";

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

/** The three steps of a plan as one bar: the ticket, the group, the meet card. Signal orange is only for the step that is live. */
export function PlanSteps({ steps }: { steps: Steps }) {
  const label = `${copy.steps.label}: ${steps.map((state, index) => `${LABELS[index]}, ${WORD[state]}`).join(". ")}`;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} className="flex-row gap-2" testID="plan-steps">
      {steps.map((state, index) => (
        <View key={LABELS[index]} className="flex-1 gap-1.5" accessible={false}>
          <View className={cn("h-1 rounded-pill", BAR[state])} />
          <Text variant="meta" className={cn(state === "pending" || state === "off" ? "text-muted" : "font-semibold")}>
            {LABELS[index]}
          </Text>
        </View>
      ))}
    </View>
  );
}
