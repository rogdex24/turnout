import { useIsFocused } from "expo-router";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useEffect } from "react";

const KEY = "turnout-faces";

/**
 * Keeps the phone from taking a screenshot or recording of this screen while it is in front, and lets it again when the person
 * leaves. The e2e build sets EXPO_PUBLIC_ALLOW_CAPTURE so Maestro can take screenshots; a release build fails to build with it set.
 */
export function useBlockCapture() {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused || process.env.EXPO_PUBLIC_ALLOW_CAPTURE === "1") return;
    void preventScreenCaptureAsync(KEY).catch(() => undefined);
    return () => void allowScreenCaptureAsync(KEY).catch(() => undefined);
  }, [focused]);
}
