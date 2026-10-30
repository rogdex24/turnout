import { spacing } from "@turnout/design-tokens";
import { CaretLeft } from "phosphor-react-native";
import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { common } from "@/copy/common";
import { IconButton } from "./primitives/IconButton";
import { Text } from "./primitives/Text";

export interface BackBarProps {
  onBack: () => void;
  /** A short screen name centred in the bar. Leave it out when the screen has its own heading. */
  title?: string;
  /** Content at the right edge, such as a share button. */
  trailing?: ReactNode;
}

/**
 * The top bar of a pushed screen: a round back button at the left, an optional action at the right and an optional centred title.
 * The title keeps clear of both sides by the wider of the two, so at the largest text size it stays centred and ends in an
 * ellipsis instead of running under the back button or the action.
 */
export function BackBar({ onBack, title, trailing }: BackBarProps) {
  const [leading, setLeading] = useState(0);
  const [trailingWidth, setTrailingWidth] = useState(0);
  const width = (set: (n: number) => void) => (event: LayoutChangeEvent) => set(event.nativeEvent.layout.width);
  // The title box spans the whole bar, so it clears the bar's own padding, the wider side and a gap.
  const inset = spacing[2] + Math.max(leading, trailingWidth) + spacing[2];
  return (
    <View className="h-14 flex-row items-center justify-between px-2">
      <View onLayout={width(setLeading)}>
        <IconButton icon={CaretLeft} label={common.back} onPress={onBack} testID="back" />
      </View>
      {title ? (
        <View className="absolute inset-x-0 items-center" style={{ paddingHorizontal: inset }} pointerEvents="none" testID="back-bar-title">
          <Text variant="control" className="font-semibold" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
      {trailing ? <View onLayout={width(setTrailingWidth)}>{trailing}</View> : null}
    </View>
  );
}
