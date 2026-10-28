import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { View } from "react-native";
import { cn } from "../cn";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface NoteProps {
  icon: PhosphorIcon;
  children: string;
  className?: string;
}

/** A raised surface with an icon for neutral information. Rejected and called-off states use it too, never danger red. */
export function Note({ icon, children, className }: NoteProps) {
  return (
    <View accessible accessibilityRole="summary" className={cn("flex-row gap-3 rounded-field bg-surface-raised px-4 py-3", className)}>
      <Icon icon={icon} size="sm" tone="muted" />
      <Text variant="body" className="flex-1">
        {children}
      </Text>
    </View>
  );
}
