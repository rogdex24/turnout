import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

/** What the rule needs to know about a show. The caller reads it from the catalog. */
export interface EligibilityInput {
  category: string;
  isFree: boolean;
  /** Cheapest ticket in INR, null when the source gave no price. */
  priceMin: number | null;
  /** ISO UTC start as stored. For a `date-only` show it is the start of the day and means nothing without an override. */
  startsAt: string;
  timeKind: "timed" | "date-only";
  /** The venue has a usable point and its geocode state is resolved, approximate or manual. */
  venuePlaced: boolean;
}

/** An operator-confirmed start time. Wins over the source's start and turns a date-only show into a timed one. */
export interface StartOverride {
  startsAt: string;
}

/** Why a show cannot have a group, in the order the rules are checked. */
export type IneligibleReason = "category" | "free" | "price" | "time_unconfirmed" | "venue" | "closed";

export type Eligibility = { eligible: true; startsAt: string; joinUntil: string } | { eligible: false; reason: IneligibleReason };

const HOUR_MS = 60 * 60 * 1000;

/** The instant people stop being able to join: T-24h. At that exact instant it is already closed, like the lock. */
export function joinUntil(startsAt: string, t: Tunables = DEFAULT_TUNABLES): string {
  return new Date(Date.parse(startsAt) - t.joinCutoffHours * HOUR_MS).toISOString();
}

/**
 * Whether a group can be made for this show right now. Pure: the clock is an argument.
 * Eligible means comedy, music or theatre; not free; priced at the minimum or more; a real start time
 * (timed, or an operator override); a placed venue; and not yet inside the last 24 hours.
 */
export function isEligible(
  event: EligibilityInput,
  override: StartOverride | null,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): Eligibility {
  if (!t.eligibleCategories.includes(event.category)) return { eligible: false, reason: "category" };
  if (event.isFree) return { eligible: false, reason: "free" };
  if (event.priceMin === null || !(event.priceMin >= t.minPriceInr)) return { eligible: false, reason: "price" };
  if (event.timeKind !== "timed" && override === null) return { eligible: false, reason: "time_unconfirmed" };
  if (!event.venuePlaced) return { eligible: false, reason: "venue" };
  const startsAt = override?.startsAt ?? event.startsAt;
  const until = joinUntil(startsAt, t);
  if (now.getTime() >= Date.parse(until)) return { eligible: false, reason: "closed" };
  return { eligible: true, startsAt, joinUntil: until };
}
