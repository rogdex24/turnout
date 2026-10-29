import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { common } from "@/copy/common";
import { useReduceMotion } from "../reduceMotion";
import { Button } from "./Button";
import { SafeAreaView } from "./SafeAreaView";
import { Text } from "./Text";

export interface SheetAction {
  title: string;
  onPress: () => void;
  /** Work is under way: the button shows a spinner and a second press does nothing. */
  loading?: boolean;
  testID?: string;
}

export interface SheetProps {
  visible: boolean;
  title: string;
  lead?: string;
  /** Closes the sheet: the scrim, the system back and the secondary action. */
  onClose: () => void;
  primary?: SheetAction;
  secondary?: SheetAction;
  children?: ReactNode;
}

/**
 * A bottom sheet: grabber, title, lead, content, one primary and one secondary action. Built on the platform Modal, so the system
 * back closes it. It slides up, or crossfades when Reduce Motion is on.
 */
export function Sheet({ visible, title, lead, onClose, primary, secondary, children }: SheetProps) {
  const reduceMotion = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={common.close}
        className="flex-1 bg-scrim"
        onPress={onClose}
        testID="sheet-scrim"
      />
      <SafeAreaView edges={["bottom"]} className="rounded-t-sheet border-t border-line bg-surface px-4 pt-2">
        <View className="mb-3 h-1 w-9 self-center rounded-pill bg-outline" accessible={false} />
        <Text variant="title-large" accessibilityRole="header">
          {title}
        </Text>
        {lead ? (
          <Text variant="body" className="mt-2 text-muted">
            {lead}
          </Text>
        ) : null}
        {children ? <View className="mt-4">{children}</View> : null}
        <View className="mb-4 mt-6 gap-3">
          {primary ? <Button title={primary.title} onPress={primary.onPress} loading={primary.loading} testID={primary.testID} /> : null}
          {secondary ? (
            <Button
              variant="secondary"
              title={secondary.title}
              onPress={secondary.onPress}
              loading={secondary.loading}
              testID={secondary.testID}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
