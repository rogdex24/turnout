import { sentryOptions, startSentry } from "./sentry";

describe("sentryOptions", () => {
  const options = sentryOptions({ dsn: "https://k@o.example.com/1", environment: "preview", release: "0.1.0" });

  it("sends no default PII, no traces and no replay", () => {
    expect(options.dsn).toBe("https://k@o.example.com/1");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
    expect(options.attachScreenshot).toBe(false);
    expect(options.attachViewHierarchy).toBe(false);
    expect(options.environment).toBe("preview");
  });

  it("scrubs the event in beforeSend", () => {
    const event = options.beforeSend?.(
      { message: "otp +1 555-0142", user: { id: "u1" }, request: { url: "https://a.example.com/x?t=1", data: "body" } } as never,
      {},
    );
    expect(event).toMatchObject({ message: "otp [phone]", request: { url: "https://a.example.com/x" } });
    expect(event).not.toHaveProperty("user");
  });

  it("scrubs breadcrumbs as they are made", () => {
    const crumb = options.beforeBreadcrumb?.({ message: "tapped +1 555-0142", data: { url: "https://a.example.com/x?t=1" } }, {});
    expect(crumb).toEqual({ message: "tapped [phone]", data: { url: "https://a.example.com/x" } });
  });
});

describe("startSentry", () => {
  it("inits once with the options and closes on stop", async () => {
    const sdk = { init: jest.fn(), close: jest.fn(async () => true) };
    const handle = startSentry({ dsn: "https://k@o.example.com/1", environment: "e2e" }, sdk);
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://k@o.example.com/1", sendDefaultPii: false }));
    await handle.stop();
    expect(sdk.close).toHaveBeenCalled();
  });
});
