import { useFocusEffect } from "expo-router";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useId } from "react";

/** The e2e variant sets this so Maestro can take screenshots. A release build refuses to start with it set (config/variants.ts). */
const captureAllowed = () => process.env.EXPO_PUBLIC_ALLOW_CAPTURE === "1";

/**
 * Blocks screenshots and screen recording while the screen is focused, and allows them again when it is not. Each screen uses its own
 * key: with one shared key, the Report form closing over the chat or After would allow capture while that screen is still open.
 */
export function useBlockCapture(): void {
  const key = useId();
  useFocusEffect(() => {
    if (captureAllowed()) return undefined;
    void preventScreenCaptureAsync(key).catch(() => undefined);
    return () => void allowScreenCaptureAsync(key).catch(() => undefined);
  });
}
