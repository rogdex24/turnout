import { DAY_MS, IST_OFFSET_MS } from "../../utils/time.js";
import { joinUntil } from "./eligibility.js";
import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

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
  /** The co-members, photos and cafe stop being served (T+24h). */
  revealClosesAt: string;
  /** T-60m: the group meets. */
  meetAt: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
  /** T+24h: the thread turns read-only. Ticket files are deleted at their own instant, `ticketDeleteAt`. */
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
    revealClosesAt: iso(start + t.plan.revealCloseHours * HOUR_MS),
    meetAt: iso(start - t.plan.meetMinutesBefore * MINUTE_MS),
    checkInOpensAt: iso(start - t.plan.headOverMinutes * MINUTE_MS),
    checkInClosesAt: iso(start + t.plan.checkInCloseMinutes * MINUTE_MS),
    threadClosesAt: iso(start + t.plan.threadCloseHoursAfterStart * HOUR_MS),
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
 * Open from T-3h until `revealCloseHours` after the start, and not at all for a group that was dissolved or called off.
 */
export function canReveal(group: { startsAt: string; state: string }, now: Date, t: Tunables = DEFAULT_TUNABLES): boolean {
  if ((NEVER_REVEALED as readonly string[]).includes(group.state)) return false;
  const m = milestones(group.startsAt, t);
  return now.getTime() >= Date.parse(m.revealAt) && now.getTime() < Date.parse(m.revealClosesAt);
}

/** True once the window has shut for good: from here the group is as good as gone, and its routes answer the 404 a stranger would get. */
export function revealClosed(group: { startsAt: string }, now: Date, t: Tunables = DEFAULT_TUNABLES): boolean {
  return now.getTime() >= Date.parse(milestones(group.startsAt, t).revealClosesAt);
}
