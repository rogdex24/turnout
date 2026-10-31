import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { ScrollView, View } from "react-native";
import { Button } from "./primitives/Button";
import { Icon } from "./primitives/Icon";
import { Text } from "./primitives/Text";

export interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  body?: string;
  action?: { title: string; onPress: () => void };
}

/** Nothing here yet: an icon, a plain sentence and at most one way forward. The icon and text read as one label; the action sits
 * outside that group, because iOS hides every child of an accessible view from VoiceOver. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <ScrollView contentContainerClassName="grow items-center justify-center px-6 py-8">
      <View className="items-center" accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
        <Icon icon={icon} tone="muted" />
        <Text variant="title-large" className="mt-3 text-center">
          {title}
        </Text>
        {body ? (
          <Text variant="body" className="mt-2 text-center text-muted">
            {body}
          </Text>
        ) : null}
      </View>
      {action ? <Button variant="secondary" className="mt-6" title={action.title} onPress={action.onPress} /> : null}
    </ScrollView>
  );
}
