import { checkInOpen, meetPhase, nextMeetBoundary, watchesLocation } from "./meetWindow";

const startsAt = "2026-11-07T13:30:00.000Z";
const start = Date.parse(startsAt);
const times = { startsAt, revealAt: new Date(start - 3 * 3_600_000).toISOString() };
const minutes = (n: number) => n * 60_000;

describe("meetPhase", () => {
  it("waits until T-3h, is live to T+24h and then closes", () => {
    expect(meetPhase(times, start - minutes(181))).toBe("waiting");
    expect(meetPhase(times, start - minutes(180))).toBe("live");
    expect(meetPhase(times, start + minutes(24 * 60 - 1))).toBe("live");
    expect(meetPhase(times, start + minutes(24 * 60))).toBe("closed");
  });

  it("waits when a time does not parse", () => {
    expect(meetPhase({ startsAt: "soon", revealAt: times.revealAt }, start)).toBe("waiting");
  });
});

describe("checkInOpen", () => {
  it("is open from T-90m to T+60m, the later boundary counting as closed", () => {
    expect(checkInOpen(startsAt, start - minutes(91))).toBe(false);
    expect(checkInOpen(startsAt, start - minutes(90))).toBe(true);
    expect(checkInOpen(startsAt, start + minutes(59))).toBe(true);
    expect(checkInOpen(startsAt, start + minutes(60))).toBe(false);
  });
});

describe("watchesLocation", () => {
  it("watches only while the card is live and the show has not started", () => {
    expect(watchesLocation(times, start - minutes(200))).toBe(false);
    expect(watchesLocation(times, start - minutes(120))).toBe(true);
    expect(watchesLocation(times, start - 1)).toBe(true);
    expect(watchesLocation(times, start)).toBe(false);
    expect(watchesLocation(times, start + minutes(600))).toBe(false);
  });
});

describe("nextMeetBoundary", () => {
  it("is the next moment something changes", () => {
    expect(nextMeetBoundary(times, start - minutes(200))).toBe(start - minutes(180));
    expect(nextMeetBoundary(times, start - minutes(180))).toBe(start - minutes(90));
    expect(nextMeetBoundary(times, start - minutes(10))).toBe(start);
    expect(nextMeetBoundary(times, start)).toBe(start + minutes(60));
    expect(nextMeetBoundary(times, start + minutes(61))).toBe(start + minutes(24 * 60));
    expect(nextMeetBoundary(times, start + minutes(24 * 60))).toBeNull();
  });
});
