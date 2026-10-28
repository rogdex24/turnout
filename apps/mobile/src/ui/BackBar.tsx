import { CaretLeft } from "phosphor-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { common } from "@/copy/common";
import { IconButton } from "./primitives/IconButton";

export interface BackBarProps {
  onBack: () => void;
  /** Content at the right edge, such as a share button. */
  trailing?: ReactNode;
}

/** The top bar of a pushed screen: a round back button at the left, an optional action at the right. The title is the screen's own heading. */
export function BackBar({ onBack, trailing }: BackBarProps) {
  return (
    <View className="h-14 flex-row items-center justify-between px-2">
      <IconButton icon={CaretLeft} label={common.back} onPress={onBack} testID="back" />
      {trailing}
    </View>
  );
}
