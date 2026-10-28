import { type LinkContext, normalizeLinkHost, resolveSystemPath } from "./linking";

const ctx: LinkContext = { linkHost: "go.example.com", scheme: "turnout", goEnabled: true, devClient: false };
const resolve = (input: string, over: Partial<LinkContext> = {}) => resolveSystemPath(input, { ...ctx, ...over });

describe("https links on the link host", () => {
  it.each([
    ["https://go.example.com/e/abc123", "/show/abc123"],
    ["https://go.example.com/e/abc123/", "/show/abc123"],
    ["https://go.example.com/e/abc123/go", "/show/abc123/go"],
    ["https://go.example.com/e/some-long_Show-2026-10-30/go", "/show/some-long_Show-2026-10-30/go"],
    ["HTTPS://GO.EXAMPLE.COM/e/abc123", "/show/abc123"],
    ["https://go.example.com/e/abc123?src=web", "/show/abc123"],
    ["https://go.example.com/e/abc123/go?src=web#top", "/show/abc123/go"],
  ])("opens %s at %s", (input, route) => {
    expect(resolve(input)).toBe(route);
  });

  it("opens the show instead when the go route is not in this build", () => {
    expect(resolve("https://go.example.com/e/abc123/go", { goEnabled: false })).toBe("/show/abc123");
  });
});

describe("hostile or unknown links go Home", () => {
  it.each([
    "https://evil.example.com/e/abc123",
    "https://go.example.com.evil.test/e/abc123",
    "https://evil.test/go.example.com/e/abc123",
    "https://user@go.example.com/e/abc123",
    "https://go.example.com@evil.test/e/abc123",
    "https://go.example.com:8443/e/abc123",
    "https://sub.go.example.com/e/abc123",
    "http://go.example.com/e/abc123",
    "https://go.example.com/e/abc123/go/extra",
    "https://go.example.com/e/abc123/other",
    "https://go.example.com/e/",
    "https://go.example.com/e",
    "https://go.example.com/e//abc123",
    "https://go.example.com/e/../settings",
    "https://go.example.com/e/%2e%2e/settings",
    "https://go.example.com/e/abc%2Fgo",
    "https://go.example.com/e/abc123.ics",
    "https://go.example.com/e/abc\\123",
    "https://go.example.com/e/abc 123",
    "https://go.example.com/e/-abc",
    `https://go.example.com/e/${"a".repeat(129)}`,
    "https://go.example.com/settings",
    "https://go.example.com/show/abc123",
    "https://go.example.com/",
    "https://go.example.com",
    "javascript:alert(1)",
    "intent://go.example.com/e/abc123#Intent;scheme=https;end",
    "tel:+15550100",
    "file:///etc/passwd",
    "data:text/html,hi",
    "exp://192.168.0.2:8081/--/show/abc123",
    "otherapp://show/abc123",
    "/settings",
    "show/abc123",
    "",
    "   ",
    `https://go.example.com/e/abc123?${"x".repeat(3000)}`,
  ])("%s", (input) => {
    expect(resolve(input)).toBe("/");
  });

  it("refuses every https link when the build has no link host", () => {
    expect(resolve("https://go.example.com/e/abc123", { linkHost: null })).toBe("/");
  });
});

describe("the custom scheme", () => {
  it.each([
    ["turnout://show/abc123", "/show/abc123"],
    ["turnout:///show/abc123", "/show/abc123"],
    ["turnout://show/abc123/go", "/show/abc123/go"],
    ["turnout://e/abc123", "/show/abc123"],
    ["turnout://e/abc123/go", "/show/abc123/go"],
    ["TURNOUT://show/abc123?x=1", "/show/abc123"],
    ["turnout://", "/"],
    ["turnout:///", "/"],
  ])("opens %s at %s", (input, route) => {
    expect(resolve(input)).toBe(route);
  });

  it("works with no link host at all, which is how the e2e build and a build before DNS opens a show", () => {
    expect(resolve("turnout://show/abc123", { linkHost: null })).toBe("/show/abc123");
  });

  it.each([
    "turnout://settings",
    "turnout://(app)/settings",
    "turnout://show/../settings",
    "turnout://show/abc123/other",
    "turnout://show/",
    "turnout://show",
    "turnout://show/%2e%2e",
    "turnout://storybook/extra",
    "turnout://expo-development-client/?url=http%3A%2F%2Fevil.test",
  ])("sends %s Home", (input) => {
    expect(resolve(input)).toBe("/");
  });

  it("opens Storybook with a plain story id, and drops anything else in the query", () => {
    expect(resolve("turnout://storybook?story=screens-show--ready")).toBe("/storybook?story=screens-show--ready");
    expect(resolve("turnout://storybook")).toBe("/storybook");
    expect(resolve("turnout://storybook?story=../../x")).toBe("/storybook");
    expect(resolve("turnout://storybook?other=1")).toBe("/storybook");
  });

  it("lets the dev client launcher through only in a development build", () => {
    const url = "turnout://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081";
    expect(resolve(url, { devClient: true })).toBe(url);
    expect(resolve(url, { devClient: false })).toBe("/");
  });

  it("keeps the scheme exact", () => {
    expect(resolve("turnout-dev://show/abc123")).toBe("/");
    expect(resolve("turnout2://show/abc123")).toBe("/");
    expect(resolve("turnout-dev://show/abc123", { scheme: "turnout-dev" })).toBe("/show/abc123");
  });
});

describe("a path the router already holds", () => {
  it.each([
    ["/show/abc123", "/show/abc123"],
    ["/show/abc123/go", "/show/abc123/go"],
    ["/", "/"],
  ])("keeps %s as %s", (input, route) => {
    expect(resolve(input)).toBe(route);
  });

  it("applies the same checks as any other link", () => {
    expect(resolve("/show/abc123/go", { goEnabled: false })).toBe("/show/abc123");
    expect(resolve("/show/../settings")).toBe("/");
    expect(resolve("/settings")).toBe("/");
    expect(resolve("//evil.example.net/show/abc123")).toBe("/");
    expect(resolve("/show/abc123?next=/settings")).toBe("/show/abc123");
  });
});

describe("normalizeLinkHost", () => {
  it.each([
    ["go.example.com", "go.example.com"],
    [" GO.Example.COM ", "go.example.com"],
    ["go.example.co.in", "go.example.co.in"],
  ])("accepts %s", (input, out) => {
    expect(normalizeLinkHost(input)).toBe(out);
  });

  it.each([
    undefined,
    "",
    "example.com",
    "www.example.com",
    "go.",
    "go.example",
    "https://go.example.com",
    "go.example.com/e",
    "go.example.com:443",
    "go.exa mple.com",
    "go..example.com",
  ])("refuses %s", (input) => {
    expect(normalizeLinkHost(input)).toBeNull();
  });
});

describe("the e2e push link", () => {
  const hooked = { pushHook: true };
  const link = "turnout://push?kind=meet_card_live&noticeId=n1&planId=p1";

  it("opens the push route in the e2e build, with only the three fields", () => {
    expect(resolve(link, hooked)).toBe("/push?kind=meet_card_live&noticeId=n1&planId=p1");
    expect(resolve("turnout://push?kind=handle_rejected&noticeId=n1", hooked)).toBe("/push?kind=handle_rejected&noticeId=n1");
    expect(resolve("turnout://push?kind=head_over&noticeId=n1&planId=p1&extra=x", hooked)).toBe(
      "/push?kind=head_over&noticeId=n1&planId=p1",
    );
  });

  it("accepts the path again once the router hands it back", () => {
    expect(resolve("/push?kind=no_group&noticeId=n1&planId=p1", hooked)).toBe("/push?kind=no_group&noticeId=n1&planId=p1");
  });

  it("is Home in every other build", () => {
    expect(resolve(link)).toBe("/");
    expect(resolve(link, { pushHook: false })).toBe("/");
    expect(resolve("/push?kind=no_group&noticeId=n1&planId=p1")).toBe("/");
  });

  it("is Home for a kind it does not know or an id that is not an id", () => {
    expect(resolve("turnout://push?kind=settings&noticeId=n1", hooked)).toBe("/");
    expect(resolve("turnout://push?noticeId=n1", hooked)).toBe("/");
    expect(resolve("turnout://push?kind=no_group&noticeId=../x", hooked)).toBe("/");
    expect(resolve("turnout://push?kind=no_group&noticeId=n1&planId=a/b", hooked)).toBe("/");
  });
});
