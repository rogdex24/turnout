import { describe, expect, test } from "bun:test";
import { canCheckIn, canReveal, checkInWindow, meetAt, milestones, revealAt } from "../src/social/model/schedule.js";
import { tunables } from "../src/social/model/tunables.js";

const START = "2026-11-10T14:00:00.000Z";
const at = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000);

describe("milestones", () => {
  test("every instant is counted from the start", () => {
    const m = milestones(START);
    expect(m.lockAt).toBe("2026-11-09T14:00:00.000Z");
    expect(m.cafeAlertAt).toBe("2026-11-10T08:00:00.000Z");
    expect(m.revealAt).toBe("2026-11-10T11:00:00.000Z");
    expect(m.headOverAt).toBe("2026-11-10T12:30:00.000Z");
    expect(m.meetAt).toBe("2026-11-10T13:00:00.000Z");
    expect(m.checkInClosesAt).toBe("2026-11-10T15:00:00.000Z");
    expect(m.ticketDeleteAt).toBe("2026-11-11T14:00:00.000Z");
    expect(m.threadClosesAt).toBe("2026-11-11T14:00:00.000Z");
  });

  test("the morning after is 10:00 IST on the next IST day, whatever time the show starts", () => {
    // 14:00Z is 19:30 IST on the 10th: the morning after is 10:00 IST on the 11th, 04:30Z.
    expect(milestones(START).morningAfterAt).toBe("2026-11-11T04:30:00.000Z");
    // 21:00Z on the 10th is 02:30 IST on the 11th: the next day is the 12th.
    expect(milestones("2026-11-10T21:00:00.000Z").morningAfterAt).toBe("2026-11-12T04:30:00.000Z");
    // 18:29Z is 23:59 IST on the 10th, 18:30Z is 00:00 IST on the 11th.
    expect(milestones("2026-11-10T18:29:00.000Z").morningAfterAt).toBe("2026-11-11T04:30:00.000Z");
    expect(milestones("2026-11-10T18:30:00.000Z").morningAfterAt).toBe("2026-11-12T04:30:00.000Z");
  });

  test("the lock is the same instant eligibility closes joining", () => {
    expect(milestones(START).lockAt).toBe("2026-11-09T14:00:00.000Z");
  });
});

describe("reveal", () => {
  const group = { startsAt: START, state: "locked" as const };

  test("opens exactly at T-3h and not a moment before", () => {
    expect(revealAt(START)).toBe("2026-11-10T11:00:00.000Z");
    expect(canReveal(group, at(START, -181))).toBe(false);
    expect(canReveal(group, new Date(Date.parse(START) - 180 * 60_000 - 1))).toBe(false);
    expect(canReveal(group, at(START, -180))).toBe(true);
    expect(canReveal(group, at(START, 0))).toBe(true);
  });

  test("a group that was dissolved or called off reveals nothing at any time", () => {
    for (const state of ["dissolved", "called_off"] as const) expect(canReveal({ startsAt: START, state }, at(START, 30))).toBe(false);
  });

  test("a done group still reveals, for the feedback that follows", () => {
    expect(canReveal({ startsAt: START, state: "done" }, at(START, 600))).toBe(true);
  });

  test("closes when the feedback window closes (72 hours after the morning after), for a done group as for a live one", () => {
    const closes = milestones(START).feedbackClosesAt;
    expect(closes).toBe("2026-11-14T04:30:00.000Z");
    expect(milestones(START).revealClosesAt).toBe(closes);
    const before = new Date(Date.parse(closes) - 1);
    const after = new Date(Date.parse(closes));
    for (const state of ["live", "done"] as const) {
      expect(canReveal({ startsAt: START, state }, at(START, 24 * 60))).toBe(true);
      expect(canReveal({ startsAt: START, state }, before)).toBe(true);
      expect(canReveal({ startsAt: START, state }, after)).toBe(false);
    }
    expect(canReveal(group, after, tunables({ feedbackWindowHours: 96 }))).toBe(true);
  });

  test("the meet time and the thread close come from tunables, not from fixed numbers", () => {
    const t = tunables({ plan: { meetMinutesBefore: 45, threadCloseHoursAfterStart: 12 } });
    expect(milestones(START, t).meetAt).toBe("2026-11-10T13:15:00.000Z");
    expect(milestones(START, t).threadClosesAt).toBe("2026-11-11T02:00:00.000Z");
    expect(milestones(START, t).ticketDeleteAt).toBe("2026-11-11T14:00:00.000Z");
  });
});

describe("check-in", () => {
  test("opens at T-90m and closes at T+60m, closed at that exact instant", () => {
    const w = checkInWindow(START);
    expect(w).toEqual({ opensAt: "2026-11-10T12:30:00.000Z", closesAt: "2026-11-10T15:00:00.000Z" });
    expect(canCheckIn(START, at(START, -91))).toBe(false);
    expect(canCheckIn(START, at(START, -90))).toBe(true);
    expect(canCheckIn(START, at(START, 59))).toBe(true);
    expect(canCheckIn(START, at(START, 60))).toBe(false);
  });

  test("the meet time is T-60m", () => {
    expect(meetAt(START)).toBe("2026-11-10T13:00:00.000Z");
  });
});
