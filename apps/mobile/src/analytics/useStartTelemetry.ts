import { useEffect } from "react";
import type { KeyValueStore } from "../api/prefs";
import { telemetry } from "./index";

/** Starts Sentry and PostHog after the first frame, so they add nothing to the time to Home. Does nothing without a key or consent. */
export function useStartTelemetry(prefs: KeyValueStore): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => telemetry(prefs).start(), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [prefs]);
}
