import { joinUntil } from "./eligibility.js";
import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Asia/Kolkata has no daylight saving: a fixed offset is exact. */
const IST_OFFSET_MS = 5.5 * HOUR_MS;

const iso = (ms: number) => new Date(ms).toISOString();

export interface Milestones {
  /** T-24h: joining closes, groups lock, plans without a group end. Same instant as `joinUntil`. */
  lockAt: string;
  /** The second alert for a group with no cafe. */
  cafeAlertAt: string;
  /** T-3h: the meet card goes live and co-members are revealed. */
  revealAt: string;
  /** T-90m: the "head over" notice, and check-in opens. */
  headOverAt: string;
  /** T-60m: the group meets. */
  meetAt: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
  /** T+24h: the thread turns read-only and ticket files are deleted. */
  threadClosesAt: string;
  ticketDeleteAt: string;
  /** 10:00 IST on the day after the show's IST day. */
  morningAfterAt: string;
}

/** Every instant the ticker acts at, counted from the show's start. Pure: no clock. */
export function milestones(startsAt: string, t: Tunables = DEFAULT_TUNABLES): Milestones {
  const start = Date.parse(startsAt);
  const istDay = Math.floor((start + IST_OFFSET_MS) / DAY_MS);
  return {
    lockAt: joinUntil(startsAt, t),
    cafeAlertAt: iso(start - t.plan.cafeAlertHoursBefore * HOUR_MS),
    revealAt: iso(start - t.plan.revealHoursBefore * HOUR_MS),
    headOverAt: iso(start - t.plan.headOverMinutes * MINUTE_MS),
    meetAt: iso(start - 60 * MINUTE_MS),
    checkInOpensAt: iso(start - t.plan.headOverMinutes * MINUTE_MS),
    checkInClosesAt: iso(start + t.plan.checkInCloseMinutes * MINUTE_MS),
    threadClosesAt: iso(start + t.plan.ticketDeleteHoursAfterStart * HOUR_MS),
    ticketDeleteAt: iso(start + t.plan.ticketDeleteHoursAfterStart * HOUR_MS),
    morningAfterAt: iso((istDay + 1) * DAY_MS + t.morningAfterHourIst * HOUR_MS - IST_OFFSET_MS),
  };
}

export const revealAt = (startsAt: string, t: Tunables = DEFAULT_TUNABLES): string => milestones(startsAt, t).revealAt;
export const meetAt = (startsAt: string, t: Tunables = DEFAULT_TUNABLES): string => milestones(startsAt, t).meetAt;

export function checkInWindow(startsAt: string, t: Tunables = DEFAULT_TUNABLES): { opensAt: string; closesAt: string } {
  const m = milestones(startsAt, t);
  return { opensAt: m.checkInOpensAt, closesAt: m.checkInClosesAt };
}

/** Check-in is open from T-90m and closed again at T+60m, each boundary instant counting as the later side. */
export function canCheckIn(startsAt: string, now: Date, t: Tunables = DEFAULT_TUNABLES): boolean {
  const w = checkInWindow(startsAt, t);
  return now.getTime() >= Date.parse(w.opensAt) && now.getTime() < Date.parse(w.closesAt);
}

/** The group states that never show co-members: the group does not exist for anyone any more. */
const NEVER_REVEALED = ["dissolved", "called_off"] as const;

/**
 * Whether co-member data (names, refs, photos, the cafe) may leave the server. Guards every route that returns it.
 * Open from T-3h, and not at all for a group that was dissolved or called off.
 */
export function canReveal(group: { startsAt: string; state: string }, now: Date, t: Tunables = DEFAULT_TUNABLES): boolean {
  if ((NEVER_REVEALED as readonly string[]).includes(group.state)) return false;
  return now.getTime() >= Date.parse(revealAt(group.startsAt, t));
}
