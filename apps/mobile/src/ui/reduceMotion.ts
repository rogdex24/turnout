import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True while the system Reduce Motion setting is on. Reveals become crossfades and loops do not play. */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => live && setOn(value),
      () => undefined,
    );
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}
