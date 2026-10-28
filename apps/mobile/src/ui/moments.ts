import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

/**
 * The haptic moments and the only file that imports expo-haptics (the `haptics-only-in-moments` dependency rule). Feedback is for the
 * three moments the design allows (group confirmed, meet card live, "I'm here"), a light tick for selection and a warning for an
 * error. When Reduce Motion is on, nothing fires: the same preference that turns the animations off turns the buzz off.
 */
let reduceMotion = false;
let ready: Promise<void> | null = null;

function readReduceMotion(): Promise<void> {
  AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
    reduceMotion = on;
  });
  return AccessibilityInfo.isReduceMotionEnabled().then(
    (on) => {
      reduceMotion = on;
    },
    () => undefined,
  );
}

/** The first call waits for the Reduce Motion setting to be read, so an early buzz cannot slip past it. */
function play(effect: () => Promise<void>): void {
  ready ??= readReduceMotion();
  ready
    .then(() => {
      if (!reduceMotion) return effect();
    })
    .catch(() => undefined);
}

export const moments = {
  /** A chip, tab or toggle changed. */
  selection: () => play(() => Haptics.selectionAsync()),
  groupConfirmed: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  meetCardLive: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  imHere: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
} as const;

/** For tests: forget what was read about Reduce Motion. */
export function resetMomentsForTest(): void {
  reduceMotion = false;
  ready = null;
}
