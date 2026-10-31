import { posthogOptions, resolvePosthogHost } from "./posthog";

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

describe("resolvePosthogHost", () => {
  const base = () => "http://10.0.2.2:3917/";

  it("leaves a real host and a missing one as they are, without asking for the API address", () => {
    const never = () => {
      throw new Error("not needed");
    };
    expect(resolvePosthogHost("https://eu.i.posthog.com", never)).toBe("https://eu.i.posthog.com");
    expect(resolvePosthogHost(undefined, never)).toBeUndefined();
    expect(resolvePosthogHost("", never)).toBe("");
  });

  it("puts a path on the API server's address, so the e2e build reaches the sink on each platform", () => {
    expect(resolvePosthogHost("/api/app/v1/__test/posthog", base)).toBe("http://10.0.2.2:3917/api/app/v1/__test/posthog");
    expect(resolvePosthogHost("/api/app/v1/__test/posthog", () => "http://localhost:3917")).toBe(
      "http://localhost:3917/api/app/v1/__test/posthog",
    );
  });
});
