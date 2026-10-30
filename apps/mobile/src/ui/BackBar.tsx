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

/** The narrowest centred title box. Below it the title moves to its own row under the bar. */
const MIN_TITLE_WIDTH = spacing[8] * 3;

/**
 * The top bar of a pushed screen: a round back button at the left, an optional action at the right and an optional centred title.
 * The title keeps clear of both sides by the wider of the two, so it stays centred and ends in an ellipsis instead of running
 * under the back button or the action. When the sides leave it less than MIN_TITLE_WIDTH, as a long action does at the largest
 * text size, the title goes on its own row under the bar instead of shrinking to nothing.
 */
export function BackBar({ onBack, title, trailing }: BackBarProps) {
  const [bar, setBar] = useState(0);
  const [leading, setLeading] = useState(0);
  const [trailingWidth, setTrailingWidth] = useState(0);
  const width = (set: (n: number) => void) => (event: LayoutChangeEvent) => set(event.nativeEvent.layout.width);
  // The title box spans the whole bar, so it clears the bar's own padding, the wider side and a gap.
  const inset = spacing[2] + Math.max(leading, trailingWidth) + spacing[2];
  // Before the first layout the bar width is unknown, so the title starts centred.
  const centred = bar === 0 || bar - 2 * inset >= MIN_TITLE_WIDTH;
  const heading = (
    <Text variant="control" className="font-semibold" accessibilityRole="header" numberOfLines={centred ? 1 : 2}>
      {title}
    </Text>
  );
  return (
    <View>
      <View className="min-h-14 flex-row items-center justify-between px-2" onLayout={width(setBar)}>
        <View onLayout={width(setLeading)}>
          <IconButton icon={CaretLeft} label={common.back} onPress={onBack} testID="back" />
        </View>
        {title && centred ? (
          <View
            className="absolute inset-x-0 items-center"
            style={{ paddingHorizontal: inset }}
            pointerEvents="none"
            testID="back-bar-title"
          >
            {heading}
          </View>
        ) : null}
        {trailing ? <View onLayout={width(setTrailingWidth)}>{trailing}</View> : null}
      </View>
      {title && !centred ? (
        <View className="px-4 pb-2" testID="back-bar-title">
          {heading}
        </View>
      ) : null}
    </View>
  );
}
