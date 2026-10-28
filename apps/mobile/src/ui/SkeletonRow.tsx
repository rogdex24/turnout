import { View } from "react-native";
import { common } from "@/copy/common";

export interface SkeletonRowProps {
  /** A poster-sized block above the lines, for a card. */
  card?: boolean;
}

/** A loading placeholder in the skeleton color. It holds still: motion is for the three moments only. */
export function SkeletonRow({ card = false }: SkeletonRowProps) {
  return (
    <View accessible accessibilityLabel={common.loading} accessibilityState={{ busy: true }} className="gap-3 px-4 py-3">
      {card ? <View className="h-44 rounded-featured bg-skeleton" /> : null}
      <View className="h-4 w-3/4 rounded-pill bg-skeleton" />
      <View className="h-3 w-1/2 rounded-pill bg-skeleton" />
    </View>
  );
}
