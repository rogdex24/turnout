const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Offsets from the show's start, the same ones the server uses (src/social/model/schedule.ts). */
const CHECK_IN_OPENS_BEFORE = 90 * MINUTE;
const CHECK_IN_CLOSES_AFTER = 60 * MINUTE;
const CARD_CLOSES_AFTER = 24 * HOUR;

export interface MeetTimes {
  /** T-3h, as the server sends it. */
  revealAt: string;
  /** The show's start. */
  startsAt: string;
}

export type MeetPhase = "waiting" | "live" | "closed";

function ms(value: string): number {
  return Date.parse(value);
}

/** The card is waiting until T-3h, live until T+24h, and closed after. A time that does not parse reads as waiting, which shows nothing. */
export function meetPhase({ revealAt, startsAt }: MeetTimes, now: number): MeetPhase {
  const reveal = ms(revealAt);
  const start = ms(startsAt);
  if (Number.isNaN(reveal) || Number.isNaN(start)) return "waiting";
  if (now < reveal) return "waiting";
  return now < start + CARD_CLOSES_AFTER ? "live" : "closed";
}

/** "I'm here" can be tapped from T-90m to T+60m (the server refuses the rest with a 409). */
export function checkInOpen(startsAt: string, now: number): boolean {
  const start = ms(startsAt);
  return !Number.isNaN(start) && now >= start - CHECK_IN_OPENS_BEFORE && now < start + CHECK_IN_CLOSES_AFTER;
}

/** The phone's position is only watched while the card is live and the show has not started. */
export function watchesLocation(times: MeetTimes, now: number): boolean {
  return meetPhase(times, now) === "live" && now < ms(times.startsAt);
}

/** When the card needs a fresh look at the clock next: the next boundary after `now`, or null when none is left. */
export function nextMeetBoundary({ revealAt, startsAt }: MeetTimes, now: number): number | null {
  const start = ms(startsAt);
  const candidates = [ms(revealAt), start - CHECK_IN_OPENS_BEFORE, start, start + CHECK_IN_CLOSES_AFTER, start + CARD_CLOSES_AFTER];
  const later = candidates.filter((t) => !Number.isNaN(t) && t > now);
  return later.length === 0 ? null : Math.min(...later);
}
