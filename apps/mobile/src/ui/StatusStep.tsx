import { CheckCircle } from "phosphor-react-native";
import { View } from "react-native";
import { cn } from "./cn";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";

export type StatusTone = "live" | "done" | "waiting";

const TEXT: Record<StatusTone, string> = { live: "text-signal", done: "text-ink", waiting: "text-muted" };

export interface StatusStepProps {
  tone: StatusTone;
  children: string;
}

/** A status line: signal for live states, ink with a check for done states, muted for waiting. Orange is only for live signal. */
export function StatusStep({ tone, children }: StatusStepProps) {
  return (
    <View className="flex-row items-center gap-2">
      {tone === "live" ? <View className="h-2 w-2 rounded-pill bg-signal" accessible={false} /> : null}
      {tone === "done" ? <Icon icon={CheckCircle} size="sm" weight="fill" /> : null}
      <Text variant="meta" className={cn("flex-1 font-semibold", TEXT[tone])}>
        {children}
      </Text>
    </View>
  );
}
