import { sizes, spacing } from "@turnout/design-tokens";
import { CaretRight } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { home } from "@/copy/home";
import { Poster } from "@/ui/Poster";
import { Icon } from "@/ui/primitives/Icon";
import { dimOnPress } from "@/ui/primitives/press";
import { Text } from "@/ui/primitives/Text";

export interface PlanBarProps {
  title: string;
  category: string;
  /** "Sat 7:00 PM", already written. */
  when: string;
  status: string;
  /** A live state (finding your group) reads in the signal color; a settled one reads muted. */
  live?: boolean;
  onPress: () => void;
}

/** The bar is 64 dp, a row and a step. It grows if the text does, and the list above it gives up the room. */
const PLAN_BAR_MIN_HEIGHT = sizes.row + spacing[2];

/** The active plan, docked as a solid strip on top of the tab bar. One tap opens the plan. */
export function PlanBar({ title, category, when, status, live = false, onPress }: PlanBarProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={home.planBar.label(title, when, status)}
      onPress={onPress}
      testID="plan-bar"
      className="flex-row items-center gap-3 border-t border-line bg-surface-raised pl-4 pr-2"
      style={(state) => [{ minHeight: PLAN_BAR_MIN_HEIGHT }, dimOnPress(state)]}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Poster variant="thumb" title={title} category={category} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="control" tabular numberOfLines={1} className="font-semibold">
          {`${title}, ${when}`}
        </Text>
        <Text variant="meta" className={live ? "text-signal" : "text-muted"}>
          {status}
        </Text>
      </View>
      <View className="items-center justify-center" style={{ width: sizes.hitMin, height: sizes.hitMin }}>
        <Icon icon={CaretRight} size="sm" tone="muted" />
      </View>
    </Pressable>
  );
}
