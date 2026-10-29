import { View } from "react-native";
import { plan as copy } from "@/copy/plan";
import { Text } from "@/ui/primitives/Text";
import { displayFaceStyle } from "@/ui/textScale";

export interface RevealCountProps {
  /** The others in the group; the person is the "plus you". */
  others: number;
  /** When the names open, already written in IST. Null once they have. */
  revealAt: string | null;
}

/**
 * The reveal card: how many people are in the group, as a number, and when the names open. Before that time there is nothing to
 * draw for a person, no name, photo or placeholder, only the count.
 */
export function RevealCount({ others, revealAt }: RevealCountProps) {
  const when = revealAt ? copy.confirmed.reveal.when(revealAt) : copy.confirmed.reveal.soon;
  return (
    <View
      accessible
      accessibilityLabel={`${copy.confirmed.reveal.accessibility(others)}. ${when}`}
      className="gap-1 rounded-field bg-surface-raised px-4 py-4"
      testID="plan-reveal"
    >
      <View className="flex-row items-center gap-3">
        <Text
          variant="body"
          tabular
          allowFontScaling={false}
          className="font-display font-extrabold"
          style={displayFaceStyle("display-numeral", 36)}
        >
          {others}
        </Text>
        <Text variant="control" className="flex-1 font-semibold">
          {copy.confirmed.reveal.label(others)}
        </Text>
      </View>
      <Text variant="meta" className="text-muted">
        {when}
      </Text>
    </View>
  );
}
