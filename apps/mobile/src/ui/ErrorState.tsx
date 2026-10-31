import { WarningCircle, WifiSlash } from "phosphor-react-native";
import { ScrollView, View } from "react-native";
import { common } from "@/copy/common";
import { Button } from "./primitives/Button";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";

export interface ErrorStateProps {
  /** Offline reads as a connection problem; anything else as a problem on our side. */
  kind?: "offline" | "server" | "rate_limited" | "other";
  /** Overrides the standard sentence for the kind. */
  message?: string;
  onRetry?: () => void;
}

const MESSAGE = {
  offline: common.errorOffline,
  server: common.errorServer,
  rate_limited: common.errorRateLimited,
  other: common.errorGeneric,
} as const;

/** A request failed: one plain sentence and a retry. Never red, never a code. The title and the sentence read as one alert, and the
 * retry sits outside that group, because iOS hides every child of an accessible view from VoiceOver. */
export function ErrorState({ kind = "other", message, onRetry }: ErrorStateProps) {
  const text = message ?? MESSAGE[kind];
  return (
    <ScrollView contentContainerClassName="grow items-center justify-center px-6 py-8">
      <View className="items-center" accessibilityRole="alert" accessible accessibilityLabel={`${common.errorTitle}. ${text}`}>
        <Icon icon={kind === "offline" ? WifiSlash : WarningCircle} tone="muted" />
        <Text variant="title-large" className="mt-3 text-center">
          {common.errorTitle}
        </Text>
        <Text variant="body" className="mt-2 text-center text-muted">
          {text}
        </Text>
      </View>
      {onRetry ? <Button variant="secondary" className="mt-6" title={common.retry} onPress={onRetry} /> : null}
    </ScrollView>
  );
}
