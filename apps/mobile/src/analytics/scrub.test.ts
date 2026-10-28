import { scrubSentryEvent, scrubText, scrubUrl } from "./scrub";

const PHONE = "+1 555-0142";
const PHONE_SPACED = "+91 555 010 0142";
const PHONE_PAREN = "(555) 010-0142";

describe("scrubText", () => {
  it.each([PHONE, PHONE_SPACED, PHONE_PAREN, "5550100142", "555-0142"])("hides the phone number %s", (phone) => {
    const out = scrubText(`call ${phone} today`);
    expect(out).toBe("call [phone] today");
  });

  it("keeps short numbers, dates and prices", () => {
    expect(scrubText("2026-10-28 at 8:00, 450 rupees, 12 going")).toBe("2026-10-28 at 8:00, 450 rupees, 12 going");
  });

  it("hides an email address", () => {
    expect(scrubText("mail asha@example.com please")).toBe("mail [email] please");
  });

  it("hides a bearer token", () => {
    expect(scrubText("Authorization: Bearer abc.def-123_xyz")).toBe("Authorization: Bearer [token]");
  });

  it("scrubs a url inside a sentence", () => {
    expect(scrubText("failed https://api.example.com/e/abc?token=secret123 again")).toBe("failed https://api.example.com/e/abc again");
  });
});

describe("scrubUrl", () => {
  it("drops the query, the fragment and the credentials", () => {
    expect(scrubUrl("https://user:pw@api.example.com/shows?otp=123456&x=1#frag")).toBe("https://api.example.com/shows");
  });

  it("replaces a path segment that looks like a token", () => {
    expect(scrubUrl("https://api.example.com/auth/9f8e7d6c5b4a39281706f5e4d3c2b1a0")).toBe("https://api.example.com/auth/[token]");
  });

  it("keeps a short public id", () => {
    expect(scrubUrl("https://go.example.com/e/abc123/go")).toBe("https://go.example.com/e/abc123/go");
  });

  it("returns text it cannot parse with the query cut off", () => {
    expect(scrubUrl("not a url?token=1")).toBe("not a url");
  });
});

describe("scrubSentryEvent", () => {
  it("removes the user, bodies, cookies and query strings, and scrubs the rest", () => {
    const event = scrubSentryEvent({
      message: `otp for ${PHONE} failed`,
      user: { id: "u1", ip_address: "10.0.0.1" },
      request: {
        url: "https://api.example.com/otp/verify?code=123456",
        data: { phone: PHONE },
        cookies: { a: "b" },
        headers: { authorization: "Bearer abc" },
        query_string: "code=123456",
      },
      exception: { values: [{ value: `bad request for ${PHONE}` }] },
      breadcrumbs: [
        { message: `tapped ${PHONE}`, data: { url: "https://api.example.com/me?t=1", status_code: 401 } },
        { category: "console" },
      ],
      extra: { note: `phone ${PHONE}`, count: 3 },
    });
    expect(event.user).toBeUndefined();
    expect(event.message).toBe("otp for [phone] failed");
    expect(event.request).toEqual({ url: "https://api.example.com/otp/verify" });
    expect(event.exception?.values?.[0]?.value).toBe("bad request for [phone]");
    expect(event.breadcrumbs?.[0]).toEqual({ message: "tapped [phone]", data: { url: "https://api.example.com/me", status_code: 401 } });
    expect(event.extra).toEqual({ note: "phone [phone]", count: 3 });
    expect(JSON.stringify(event)).not.toContain("555");
  });

  it("leaves an event with nothing to hide alone", () => {
    expect(scrubSentryEvent({ message: "boom" })).toEqual({ message: "boom" });
  });
});
