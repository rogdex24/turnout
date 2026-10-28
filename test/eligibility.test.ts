import { expect, test } from "bun:test";
import { type EligibilityInput, isEligible, joinUntil } from "../src/social/model/eligibility.js";
import { DEFAULT_TUNABLES, tunables } from "../src/social/model/tunables.js";

const START = "2026-11-10T14:00:00.000Z";
const T24 = new Date("2026-11-09T14:00:00.000Z");

function show(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    category: "comedy",
    isFree: false,
    priceMin: 599,
    startsAt: START,
    timeKind: "timed",
    venuePlaced: true,
    ...overrides,
  };
}

const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);
const reason = (result: ReturnType<typeof isEligible>) => (result.eligible ? "eligible" : result.reason);

test("price boundary: 498 is out, 499 is in", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  expect(reason(isEligible(show({ priceMin: 498 }), null, now))).toBe("price");
  expect(reason(isEligible(show({ priceMin: 498.99 }), null, now))).toBe("price");
  expect(reason(isEligible(show({ priceMin: 499 }), null, now))).toBe("eligible");
  expect(reason(isEligible(show({ priceMin: null }), null, now))).toBe("price");
});

test("time boundary: exactly T-24h is closed, one minute earlier is open", () => {
  expect(reason(isEligible(show(), null, at(T24, -1)))).toBe("eligible");
  expect(reason(isEligible(show(), null, T24))).toBe("closed");
  expect(reason(isEligible(show(), null, at(T24, 1)))).toBe("closed");
  expect(joinUntil(START)).toBe(T24.toISOString());
});

test("a free show is never eligible, whatever its price field says", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  expect(reason(isEligible(show({ isFree: true, priceMin: 999 }), null, now))).toBe("free");
});

test("only comedy, music and theatre", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  for (const category of ["comedy", "music", "theatre"]) {
    expect(reason(isEligible(show({ category }), null, now))).toBe("eligible");
  }
  for (const category of ["film", "sports", "workshops", "other"]) {
    expect(reason(isEligible(show({ category }), null, now))).toBe("category");
  }
});

test("a date-only show needs an operator override; the override's time decides the cutoff", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const dateOnly = show({ timeKind: "date-only", startsAt: "2026-11-10T00:00:00.000Z" });
  expect(reason(isEligible(dateOnly, null, now))).toBe("time_unconfirmed");

  const override = { startsAt: START };
  const result = isEligible(dateOnly, override, now);
  expect(result).toEqual({ eligible: true, startsAt: START, joinUntil: T24.toISOString() });
  // The override moves the cutoff, not the source's midnight.
  expect(reason(isEligible(dateOnly, override, at(T24, -1)))).toBe("eligible");
  expect(reason(isEligible(dateOnly, override, T24))).toBe("closed");
});

test("an unplaced venue is not eligible", () => {
  expect(reason(isEligible(show({ venuePlaced: false }), null, new Date("2026-11-01T00:00:00Z")))).toBe("venue");
});

test("a past show is closed", () => {
  expect(reason(isEligible(show(), null, new Date("2026-12-01T00:00:00Z")))).toBe("closed");
});

test("the numbers come from tunables", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const strict = tunables({ minPriceInr: 1000 });
  expect(reason(isEligible(show({ priceMin: 999 }), null, now, strict))).toBe("price");
  expect(DEFAULT_TUNABLES.minPriceInr).toBe(499);
  expect(DEFAULT_TUNABLES.joinCutoffHours).toBe(24);
});
