import { useFocusEffect } from "expo-router";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";

/** The e2e variant sets this so Maestro can take screenshots. A release build refuses to start with it set (config/variants.ts). */
const captureAllowed = () => process.env.EXPO_PUBLIC_ALLOW_CAPTURE === "1";

/** Blocks screenshots and screen recording while the screen is focused, and allows them again when it is not. */
export function useBlockCapture(): void {
  useFocusEffect(() => {
    if (captureAllowed()) return undefined;
    void preventScreenCaptureAsync().catch(() => undefined);
    return () => void allowScreenCaptureAsync().catch(() => undefined);
  });
}
