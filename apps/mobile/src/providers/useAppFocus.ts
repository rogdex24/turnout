import { focusManager } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

/**
 * Tells TanStack Query when the app is in the background. React Native has no window focus, so without this its polling goes on
 * with the screen off, and a return to the app does not read what is stale. Set up once, in the providers.
 */
export function useAppFocus(): void {
  useEffect(() => {
    if (AppState.currentState === "background") focusManager.setFocused(false);
    const subscription = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);
}
