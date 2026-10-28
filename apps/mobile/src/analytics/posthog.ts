import type { PostHogOptions } from "posthog-react-native";
import type { AnalyticsClient } from "./telemetry";

/**
 * Nothing is recorded unless the app asks: no opt-in by default, no session replay, no lifecycle or exception autocapture, no
 * geo lookup. The id lives in memory, so it is new on each launch and nothing about the person is kept on the phone by the SDK.
 */
export function posthogOptions({ host }: { host?: string }): PostHogOptions {
  return {
    ...(host === undefined ? {} : { host }),
    defaultOptIn: false,
    enableSessionReplay: false,
    captureAppLifecycleEvents: false,
    errorTracking: { autocapture: false },
    disableGeoip: true,
    persistence: "memory",
  };
}

/** The real client. The package is loaded here, when consent has been given, so a start without consent never reads it. */
export function createPostHogClient(key: string, host?: string): AnalyticsClient {
  const { PostHog } = require("posthog-react-native") as typeof import("posthog-react-native");
  return new PostHog(key, posthogOptions({ host }));
}
