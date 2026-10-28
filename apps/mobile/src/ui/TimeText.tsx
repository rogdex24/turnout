import { formatShowDay, formatShowTime, formatShowWhen } from "@/model/showTime";
import { type AppTextProps, Text } from "./primitives/Text";

export interface TimeTextProps extends Omit<AppTextProps, "children" | "tabular"> {
  /** A show's `starts_at_local`. */
  value: string;
  /** The whole, the day only ("Sat 7 Nov") or the clock only ("7:00 PM"). Clock-only is empty for a date-only show. */
  part?: "when" | "day" | "time";
}

/** A show time or date in tabular figures. */
export function TimeText({ value, part = "when", variant = "meta", ...rest }: TimeTextProps) {
  const text = part === "day" ? formatShowDay(value) : part === "time" ? formatShowTime(value) : formatShowWhen(value);
  if (!text) return null;
  return (
    <Text variant={variant} tabular {...rest}>
      {text}
    </Text>
  );
}
