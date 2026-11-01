import { analyticsConsent, type KeyValueStore, setAnalyticsConsent } from "../api/prefs";
import { type EventName, type EventProps, safeProps } from "./events";

/** The two keys, from the build's environment. A blank or missing value means that part is off. */
export interface TelemetryConfig {
  posthogKey?: string;
  posthogHost?: string;
  sentryDsn?: string;
}

export interface AnalyticsClient {
  capture(event: string, properties?: Record<string, string | number | boolean>): void;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
}

export interface SentryHandle {
  stop(): Promise<void>;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function telemetryConfig(raw: { posthogKey?: string; posthogHost?: string; sentryDsn?: string }): TelemetryConfig {
  const out: TelemetryConfig = {};
  const posthogKey = clean(raw.posthogKey);
  const posthogHost = clean(raw.posthogHost);
  const sentryDsn = clean(raw.sentryDsn);
  if (posthogKey) out.posthogKey = posthogKey;
  if (posthogHost) out.posthogHost = posthogHost;
  if (sentryDsn) out.sentryDsn = sentryDsn;
  return out;
}

export interface Telemetry {
  /** Starts what the saved choice allows and sends `app_opened`. Called once after the first screen is up. */
  start(): void;
  /** The "Share usage data" switch: saves the choice, then starts or stops everything. */
  setConsent(on: boolean): void;
  track<N extends EventName>(name: N, props: EventProps[N]): void;
}

export interface TelemetryParts {
  config: TelemetryConfig;
  prefs: KeyValueStore;
  makeClient: (key: string, host?: string) => AnalyticsClient;
  makeSentry: (dsn: string) => SentryHandle;
}

/**
 * The one gate in front of Sentry and PostHog. Until the person has turned "Share usage data" on, no client is built, no SDK is
 * loaded and `track` does nothing. With no key in the build it stays a no-op even after consent.
 */
export function createTelemetry({ config, prefs, makeClient, makeSentry }: TelemetryParts): Telemetry {
  let client: AnalyticsClient | null = null;
  let sentry: SentryHandle | null = null;
  let opened = false;

  function activate() {
    if (config.posthogKey && client === null) {
      client = makeClient(config.posthogKey, config.posthogHost);
      void client.optIn();
    }
    if (config.sentryDsn && sentry === null) sentry = makeSentry(config.sentryDsn);
  }

  function deactivate() {
    void client?.optOut();
    client = null;
    void sentry?.stop();
    sentry = null;
  }

  return {
    start() {
      if (!analyticsConsent(prefs)) return;
      activate();
      // The top of the funnel. A launch counts once, and only when the saved choice allows sending.
      if (client !== null && !opened) {
        opened = true;
        client.capture("app_opened", {});
      }
    },
    setConsent(on) {
      setAnalyticsConsent(prefs, on);
      if (on) activate();
      else deactivate();
    },
    track(name, props) {
      if (client === null || !analyticsConsent(prefs)) return;
      const safe = safeProps(name, props);
      if (safe !== null) client.capture(name, safe);
    },
  };
}
