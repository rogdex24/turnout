import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Switch as RNSwitch } from "react-native";
import { useColors } from "../theme";

export interface SwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * The app's on and off switch, in the theme's colours. iOS 26 clears a UISwitch's thumb colour when the app comes back to the
 * front, for example after a system alert, and React Native sets it again only when the prop changes, so the thumb turned white
 * (https://github.com/facebook/react-native/issues/53856). On iOS the switch is built again each time the app becomes active.
 */
export function Switch({ value, onValueChange, disabled = false, accessibilityLabel, testID }: SwitchProps) {
  const colors = useColors();
  const generation = useResumeGeneration();
  return (
    <RNSwitch
      key={generation}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: colors.surfaceRaised, true: colors.ink }}
      thumbColor={value ? colors.bg : colors.muted}
      ios_backgroundColor={colors.surfaceRaised}
      testID={testID}
    />
  );
}

/** A number that goes up each time the app comes back to the front on iOS, and stays 0 elsewhere. */
function useResumeGeneration(): number {
  const [generation, setGeneration] = useState(0);
  const previous = useRef(AppState.currentState);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (previous.current !== "active" && next === "active") setGeneration((n) => n + 1);
      previous.current = next;
    });
    return () => subscription.remove();
  }, []);
  return generation;
}
