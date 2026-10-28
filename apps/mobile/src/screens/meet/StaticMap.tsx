import { Coffee, MicrophoneStage } from "phosphor-react-native";
import { View } from "react-native";
import { meet as copy } from "@/copy/meet";
import { Icon } from "@/ui/primitives/Icon";
import { Text } from "@/ui/primitives/Text";

export interface StaticMapProps {
  cafeName: string;
  /** Null when the venue has no pin or no name: the card then shows the cafe alone. */
  venueName: string | null;
  hasVenuePin: boolean;
  label: string;
}

/**
 * The map card for builds without a Maps key (and the e2e build): the cafe and the venue as two markers on a quiet surface, joined by
 * a dotted line. Not to scale. It carries the same names the real map's pins do.
 */
export function StaticMap({ cafeName, venueName, hasVenuePin, label }: StaticMapProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="h-28 justify-center bg-surface-raised"
      testID="meet-map-static"
    >
      <View className="flex-row items-center px-8" importantForAccessibility="no-hide-descendants">
        <View className="size-9 items-center justify-center rounded-pill bg-primary">
          <Icon icon={Coffee} size="sm" tone="onPrimary" weight="fill" />
        </View>
        {hasVenuePin ? (
          <>
            <View className="mx-2 h-0 flex-1 border-t-2 border-dotted border-ink" />
            <View className="size-8 items-center justify-center rounded-pill border border-outline bg-surface">
              <Icon icon={MicrophoneStage} size="sm" tone="ink" weight="fill" />
            </View>
          </>
        ) : null}
      </View>
      <View className="mt-2 flex-row justify-between px-6" importantForAccessibility="no-hide-descendants">
        <Text variant="label" className="max-w-[45%] text-ink" numberOfLines={1}>
          {cafeName}
        </Text>
        {hasVenuePin ? (
          <Text variant="label" className="max-w-[45%] text-muted" numberOfLines={1}>
            {venueName ?? copy.map.venue}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
