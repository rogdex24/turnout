import { formatPrice, formatShowDay, formatShowShort, formatShowTime, formatShowWhen, parseLocal, priceFrom } from "./showTime";

describe("parseLocal", () => {
  it("reads a timed value with an offset", () => {
    expect(parseLocal("2026-11-07T19:00:00+05:30")).toEqual({ year: 2026, month: 11, day: 7, hour: 19, minute: 0, dateOnly: false });
  });

  it("reads a date-only value", () => {
    expect(parseLocal("2026-11-07")).toEqual({ year: 2026, month: 11, day: 7, hour: 0, minute: 0, dateOnly: true });
  });

  it("returns null for anything else", () => {
    expect(parseLocal("")).toBeNull();
    expect(parseLocal("next Saturday")).toBeNull();
    expect(parseLocal("2026-13-40T99:00:00+05:30")).toBeNull();
  });
});

describe("show time text", () => {
  it("writes the day with its weekday", () => {
    expect(formatShowDay("2026-11-07T19:00:00+05:30")).toBe("Sat 7 Nov");
    expect(formatShowDay("2026-12-01")).toBe("Tue 1 Dec");
  });

  it("writes the time on a 12 hour clock", () => {
    expect(formatShowTime("2026-11-07T19:00:00+05:30")).toBe("7:00 PM");
    expect(formatShowTime("2026-11-07T00:05:00+05:30")).toBe("12:05 AM");
    expect(formatShowTime("2026-11-07T12:30:00+05:30")).toBe("12:30 PM");
  });

  it("has no time for a date-only show", () => {
    expect(formatShowTime("2026-11-07")).toBeNull();
    expect(formatShowWhen("2026-11-07")).toBe("Sat 7 Nov");
  });

  it("joins day and time with a comma, never a middle dot", () => {
    expect(formatShowWhen("2026-11-07T19:00:00+05:30")).toBe("Sat 7 Nov, 7:00 PM");
  });

  it("falls back to the raw text when it cannot be read", () => {
    expect(formatShowWhen("soon")).toBe("soon");
  });
});

describe("formatPrice", () => {
  const base = { is_free: false, price_min: null, price_max: null, currency: "INR" };

  it("says Free", () => {
    expect(formatPrice({ ...base, is_free: true })).toBe("Free");
  });

  it("writes one price or a range", () => {
    expect(formatPrice({ ...base, price_min: 499, price_max: 499 })).toBe("₹499");
    expect(formatPrice({ ...base, price_min: 499, price_max: null })).toBe("₹499");
    expect(formatPrice({ ...base, price_min: 499, price_max: 1499 })).toBe("₹499 to ₹1,499");
  });

  it("groups lakhs the Indian way", () => {
    expect(formatPrice({ ...base, price_min: 125000, price_max: 125000 })).toBe("₹1,25,000");
  });

  it("is null when the price is unknown", () => {
    expect(formatPrice(base)).toBeNull();
  });

  it("names another currency", () => {
    expect(formatPrice({ ...base, currency: "USD", price_min: 20, price_max: 20 })).toBe("USD 20");
  });
});

describe("priceFrom", () => {
  const base = { is_free: false, currency: "INR" };

  it("gives the lowest price and says when there is a range", () => {
    expect(priceFrom({ ...base, price_min: 1499, price_max: 2999 })).toEqual({ amount: "₹1,499", isRange: true });
    expect(priceFrom({ ...base, price_min: 500, price_max: 500 })).toEqual({ amount: "₹500", isRange: false });
    expect(priceFrom({ ...base, price_min: 500, price_max: null })).toEqual({ amount: "₹500", isRange: false });
    expect(priceFrom({ ...base, price_min: null, price_max: 800 })).toEqual({ amount: "₹800", isRange: false });
  });

  it("reads a free show and a show with no price", () => {
    expect(priceFrom({ ...base, is_free: true, price_min: null, price_max: null })).toEqual({ amount: "Free", isRange: false });
    expect(priceFrom({ ...base, price_min: null, price_max: null })).toBeNull();
  });
});

describe("formatShowShort", () => {
  it("writes the weekday and the clock, or the day for a date-only show", () => {
    expect(formatShowShort("2026-11-07T19:00:00+05:30")).toBe("Sat 7:00 PM");
    expect(formatShowShort("2026-11-07")).toBe("Sat 7 Nov");
    expect(formatShowShort("soon")).toBe("soon");
  });
});
