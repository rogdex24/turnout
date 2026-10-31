import type { PostHogOptions } from "posthog-react-native";
import type { AnalyticsClient } from "./telemetry";

/**
 * `EXPO_PUBLIC_POSTHOG_HOST` as the SDK should get it. A value that starts with `/` is a path on the API server: the e2e build points
 * PostHog at the seeded server's capture sink (`/api/app/v1/__test/posthog`), whose address differs per platform and is only known at
 * run time. Any other value, a real host in a release build, is used as written.
 */
export function resolvePosthogHost(host: string | undefined, apiBase: () => string): string | undefined {
  if (host === undefined || !host.startsWith("/")) return host;
  return apiBase().replace(/\/+$/, "") + host;
}

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
