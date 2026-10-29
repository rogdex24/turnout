import { hasPassed, isRevealed, istClock, istDay, istShort, istTime, istWhen, revealFor, toIstLocal } from "./planTime";

describe("Indian time", () => {
  test("shifts a UTC instant by 5 hours 30 minutes", () => {
    expect(toIstLocal("2026-10-30T14:30:00.000Z")).toBe("2026-10-30T20:00");
    expect(istWhen("2026-10-30T14:30:00.000Z")).toBe("Fri 30 Oct, 8:00 PM");
    expect(istTime("2026-10-30T11:30:00.000Z")).toBe("5:00 PM");
    expect(istShort("2026-10-29T14:30:00Z")).toBe("Thu 8:00 PM");
  });

  test("rolls into the next day, and the next month, past midnight in India", () => {
    expect(istWhen("2026-10-30T19:00:00Z")).toBe("Sat 31 Oct, 12:30 AM");
    expect(istDay("2026-10-31T20:00:00Z")).toBe("Sun 1 Nov");
  });

  test("ignores the phone's own zone", () => {
    const zone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(istWhen("2026-10-30T14:30:00Z")).toBe("Fri 30 Oct, 8:00 PM");
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  test("gives nothing for a value that is not a time", () => {
    expect(toIstLocal("soon")).toBeNull();
    expect(istWhen("soon")).toBe("");
  });
});

describe("the reveal", () => {
  const revealAt = "2026-10-30T11:30:00.000Z";
  test("opens at the reveal moment and not a minute before", () => {
    expect(isRevealed(new Date("2026-10-30T11:29:59.999Z"), revealAt)).toBe(false);
    expect(isRevealed(new Date("2026-10-30T11:30:00.000Z"), revealAt)).toBe(true);
    expect(isRevealed(new Date("2026-10-31T00:00:00.000Z"), revealAt)).toBe(true);
  });

  test("stays closed for a time it cannot read", () => {
    expect(isRevealed(new Date(), "later")).toBe(false);
    expect(hasPassed(new Date(), "later")).toBe(false);
  });
});

describe("moments said the way people say them", () => {
  const revealAt = "2026-10-30T11:30:00.000Z";
  test("the time alone on the same Indian day, the weekday too on another", () => {
    expect(istClock(revealAt, new Date("2026-10-30T04:00:00Z"))).toBe("5:00 PM");
    expect(istClock(revealAt, new Date("2026-10-28T09:00:00Z"))).toBe("Fri 5:00 PM");
  });

  test("compares days on the Indian clock, not the phone's", () => {
    // 19:00 UTC on the 29th is already 12:30 AM on the 30th in India.
    expect(istClock(revealAt, new Date("2026-10-29T19:00:00Z"))).toBe("5:00 PM");
  });

  test("the reveal is 3 hours before the show", () => {
    expect(revealFor("2026-10-30T14:30:00.000Z")).toBe(revealAt);
    expect(revealFor("soon")).toBeNull();
  });
});
