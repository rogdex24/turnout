import { WifiSlash } from "phosphor-react-native";
import { View } from "react-native";
import { common } from "@/copy/common";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";

/** A solid strip under the header while the phone has no connection. Neutral, with a bottom rule. */
export function OfflineBar() {
  return (
    <View
      accessibilityRole="alert"
      accessible
      accessibilityLabel={common.offlineBar}
      className="flex-row items-center gap-2 border-b border-line bg-surface-raised px-4 py-2"
    >
      <Icon icon={WifiSlash} size="sm" tone="muted" />
      <Text variant="meta" className="flex-1">
        {common.offlineBar}
      </Text>
    </View>
  );
}
