import { sizes } from "@turnout/design-tokens";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { View } from "react-native";
import { cn } from "./cn";
import { Icon } from "./primitives/Icon";
import { Switch } from "./primitives/Switch";
import { Text } from "./primitives/Text";

export interface ToggleRowProps {
  title: string;
  /** One line under the title that says what the switch does. */
  sub?: string;
  icon?: PhosphorIcon;
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Held while a change is being saved. */
  disabled?: boolean;
  /** One sentence under the row when the change did not go through. */
  error?: string | null;
  className?: string;
  testID?: string;
}

/** A settings row with a switch at the end. The switch carries the name and the sub line, so a screen reader says both. */
export function ToggleRow({ title, sub, icon, value, onValueChange, disabled = false, error, className, testID }: ToggleRowProps) {
  return (
    <View className={className}>
      <View className="flex-row items-center gap-3 px-4 py-2" style={{ minHeight: sizes.row }}>
        {icon ? <Icon icon={icon} tone="muted" /> : null}
        <View className="flex-1">
          <Text variant="control" className="font-semibold">
            {title}
          </Text>
          {sub ? (
            <Text variant="meta" className="text-muted">
              {sub}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={sub ? `${title}, ${sub}` : title}
          testID={testID}
        />
      </View>
      {error ? (
        <Text
          variant="meta"
          className={cn("px-4 pb-2", icon && "pl-14")}
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
