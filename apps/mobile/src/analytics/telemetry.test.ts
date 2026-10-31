import { analyticsConsent, memoryKv } from "../api/prefs";
import { type AnalyticsClient, createTelemetry, type SentryHandle, telemetryConfig } from "./telemetry";

function harness(config: { posthogKey?: string; sentryDsn?: string } = { posthogKey: "phc_test", sentryDsn: "https://k@o.example.com/1" }) {
  const prefs = memoryKv();
  const client = { capture: jest.fn(), optIn: jest.fn(async () => {}), optOut: jest.fn(async () => {}) } satisfies AnalyticsClient;
  const sentry: SentryHandle = { stop: jest.fn(async () => {}) };
  const makeClient = jest.fn(() => client);
  const makeSentry = jest.fn(() => sentry);
  const telemetry = createTelemetry({ config, prefs, makeClient, makeSentry });
  return { prefs, client, sentry, makeClient, makeSentry, telemetry };
}

describe("before consent", () => {
  it("builds no client, starts no Sentry and sends nothing", () => {
    const h = harness();
    h.telemetry.start();
    h.telemetry.track("show_viewed", { show_id: "abc123" });
    expect(h.makeClient).not.toHaveBeenCalled();
    expect(h.makeSentry).not.toHaveBeenCalled();
    expect(h.client.capture).not.toHaveBeenCalled();
  });
});

describe("with consent", () => {
  it("starts both and sends only the typed event", () => {
    const h = harness();
    h.telemetry.setConsent(true);
    expect(analyticsConsent(h.prefs)).toBe(true);
    expect(h.makeSentry).toHaveBeenCalledTimes(1);
    expect(h.client.optIn).toHaveBeenCalled();
    h.telemetry.track("go_tapped", { show_id: "abc123", groups_enabled: false });
    expect(h.client.capture).toHaveBeenCalledWith("go_tapped", { show_id: "abc123", groups_enabled: false });
  });

  it("starts on the next launch from the saved choice", () => {
    const h = harness();
    h.telemetry.setConsent(true);
    const again = createTelemetry({
      config: { posthogKey: "k", sentryDsn: "d" },
      prefs: h.prefs,
      makeClient: h.makeClient,
      makeSentry: h.makeSentry,
    });
    again.start();
    expect(h.makeSentry).toHaveBeenCalledTimes(2);
  });

  it("sends app_opened once per launch, at the start the saved choice allows", () => {
    const h = harness();
    h.telemetry.setConsent(true);
    expect(h.client.capture).not.toHaveBeenCalled();
    const again = createTelemetry({ config: { posthogKey: "k" }, prefs: h.prefs, makeClient: h.makeClient, makeSentry: h.makeSentry });
    again.start();
    again.start();
    expect(h.client.capture.mock.calls).toEqual([["app_opened", {}]]);
  });

  it("sends no app_opened at start without consent", () => {
    const h = harness();
    h.telemetry.start();
    h.telemetry.setConsent(true);
    expect(h.client.capture).not.toHaveBeenCalled();
  });

  it("drops an event that carries a location, handle or person", () => {
    const h = harness();
    h.telemetry.setConsent(true);
    h.telemetry.track("show_viewed", { show_id: "abc123", lat: 12.9 } as never);
    expect(h.client.capture).not.toHaveBeenCalled();
  });

  it("opts out and stops Sentry when the person turns sharing off", () => {
    const h = harness();
    h.telemetry.setConsent(true);
    h.telemetry.setConsent(false);
    expect(analyticsConsent(h.prefs)).toBe(false);
    expect(h.client.optOut).toHaveBeenCalled();
    expect(h.sentry.stop).toHaveBeenCalled();
    h.telemetry.track("show_viewed", { show_id: "abc123" });
    expect(h.client.capture).not.toHaveBeenCalled();
  });

  it("does not start a second Sentry when consent is set twice", () => {
    const h = harness();
    h.telemetry.setConsent(true);
    h.telemetry.setConsent(true);
    expect(h.makeSentry).toHaveBeenCalledTimes(1);
  });
});

describe("without a key", () => {
  it("is a no-op even with consent", () => {
    const h = harness({});
    h.telemetry.setConsent(true);
    h.telemetry.track("app_opened", {});
    expect(h.makeClient).not.toHaveBeenCalled();
    expect(h.makeSentry).not.toHaveBeenCalled();
  });

  it("starts only the part that has a key", () => {
    const h = harness({ sentryDsn: "https://k@o.example.com/1" });
    h.telemetry.setConsent(true);
    expect(h.makeSentry).toHaveBeenCalledTimes(1);
    expect(h.makeClient).not.toHaveBeenCalled();
  });
});

describe("telemetryConfig", () => {
  it("reads blank values as not set", () => {
    expect(telemetryConfig({ posthogKey: " ", sentryDsn: "", posthogHost: undefined })).toEqual({});
  });

  it("keeps trimmed values", () => {
    expect(
      telemetryConfig({ posthogKey: " phc_x ", sentryDsn: "https://k@o.example.com/1", posthogHost: "https://eu.i.posthog.com" }),
    ).toEqual({
      posthogKey: "phc_x",
      sentryDsn: "https://k@o.example.com/1",
      posthogHost: "https://eu.i.posthog.com",
    });
  });
});
