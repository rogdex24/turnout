import { posthogOptions } from "./posthog";

describe("posthogOptions", () => {
  const options = posthogOptions({ host: "https://eu.i.posthog.com" });

  it("records nothing by itself", () => {
    expect(options.defaultOptIn).toBe(false);
    expect(options.enableSessionReplay).toBe(false);
    expect(options.captureAppLifecycleEvents).toBe(false);
    expect(options.errorTracking).toEqual({ autocapture: false });
    expect(options.disableGeoip).toBe(true);
    expect(options.persistence).toBe("memory");
    expect(options.host).toBe("https://eu.i.posthog.com");
  });

  it("leaves the host to the SDK when none is given", () => {
    expect(posthogOptions({})).not.toHaveProperty("host");
  });
});
