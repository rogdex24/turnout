import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { View } from "react-native";
import { Button } from "./primitives/Button";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";

export interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  body?: string;
  action?: { title: string; onPress: () => void };
}

/** Nothing here yet: an icon, a plain sentence and at most one way forward. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <View className="items-center px-6 py-8" accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
      <Icon icon={icon} tone="muted" />
      <Text variant="title-large" className="mt-3 text-center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" className="mt-2 text-center text-muted">
          {body}
        </Text>
      ) : null}
      {action ? <Button variant="secondary" className="mt-6" title={action.title} onPress={action.onPress} /> : null}
    </View>
  );
}
