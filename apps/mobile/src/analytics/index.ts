import Constants from "expo-constants";
import { apiBaseUrl } from "../api/baseUrl";
import type { KeyValueStore } from "../api/prefs";
import { createPostHogClient, resolvePosthogHost } from "./posthog";
import { startSentry } from "./sentry";
import { createTelemetry, type Telemetry, telemetryConfig } from "./telemetry";

export type { EventName, EventProps } from "./events";
export type { Telemetry } from "./telemetry";

let current: Telemetry | null = null;

/** Metro inlines `EXPO_PUBLIC_*` only when the whole name is written out, so each one is read here by its full name. */
function create(prefs: KeyValueStore): Telemetry {
  const config = telemetryConfig({
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: resolvePosthogHost(process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim(), apiBaseUrl),
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  });
  const environment = String(Constants.expoConfig?.extra?.variant ?? "development");
  const release = Constants.expoConfig?.version;
  return createTelemetry({
    config,
    prefs,
    makeClient: createPostHogClient,
    makeSentry: (dsn) => startSentry({ dsn, environment, release }),
  });
}

/** The app's telemetry, made on first use. Screens call `telemetry(prefs).track(...)`; with no key or no consent it does nothing. */
export function telemetry(prefs: KeyValueStore): Telemetry {
  current ??= create(prefs);
  return current;
}
