import { safeWebUrl } from "./externalLink";

describe("safeWebUrl", () => {
  it("passes web addresses through as written", () => {
    expect(safeWebUrl("https://example.com/tickets/monsoon-theory")).toBe("https://example.com/tickets/monsoon-theory");
    expect(safeWebUrl("http://example.com/a?b=1")).toBe("http://example.com/a?b=1");
  });

  it("trims the address", () => {
    expect(safeWebUrl("  https://example.com/x  ")).toBe("https://example.com/x");
  });

  it.each([
    "javascript:alert(1)",
    "intent://scan/#Intent;scheme=zxing;end",
    "tel:+910000000100",
    "file:///etc/passwd",
    "turnout://show/x",
    "//example.com/x",
    "example.com/x",
    "",
    "   ",
  ])("refuses %p", (value) => {
    expect(safeWebUrl(value)).toBeNull();
  });

  it("refuses null and undefined", () => {
    expect(safeWebUrl(null)).toBeNull();
    expect(safeWebUrl(undefined)).toBeNull();
  });
});
