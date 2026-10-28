import type { ReactNativeOptions } from "@sentry/react-native";
import { scrubBreadcrumb, scrubSentryEvent } from "./scrub";
import type { SentryHandle } from "./telemetry";

export interface SentrySettings {
  dsn: string;
  environment: string;
  release?: string;
}

export interface SentrySdk {
  init(options: ReactNativeOptions): void;
  close(): Promise<unknown>;
}

/**
 * Error reports only: no default PII, no traces, no replay, no screenshots. `beforeSend` and `beforeBreadcrumb` remove the person,
 * request bodies, queries and tokens, and hide phone numbers in any text.
 */
export function sentryOptions({ dsn, environment, release }: SentrySettings): ReactNativeOptions {
  return {
    dsn,
    environment,
    ...(release === undefined ? {} : { release }),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  };
}

/** The real SDK, loaded only when it is started, after consent. */
function realSdk(): SentrySdk {
  return require("@sentry/react-native") as typeof import("@sentry/react-native");
}

export function startSentry(settings: SentrySettings, sdk: SentrySdk = realSdk()): SentryHandle {
  sdk.init(sentryOptions(settings));
  return { stop: async () => void (await sdk.close()) };
}
