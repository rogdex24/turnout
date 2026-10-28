import { HYDERABAD_BOX, isPlacedVenue, PLACED_GEOCODE_STATES } from "../catalog/venue.js";
import { type Eligibility, isEligible, type StartOverride } from "../social/model/eligibility.js";
import { DEFAULT_TUNABLES, type Tunables } from "../social/model/tunables.js";
import type { EventCard } from "./types.js";

/**
 * Whether a group can be made for this show. The rule itself is `isEligible` (social/model); this reads
 * the card's venue the way the map does. The operator's start time, when there is one, is on the card.
 */
export function groupEligibility(card: EventCard, now: Date, t: Tunables = DEFAULT_TUNABLES): Eligibility {
  const override: StartOverride | null = card.overrideStartsAt === null ? null : { startsAt: card.overrideStartsAt };
  return isEligible(
    {
      category: card.category,
      isFree: card.isFree === 1,
      priceMin: card.priceMin,
      startsAt: card.startsAt,
      timeKind: card.timeKind,
      venuePlaced: isPlacedVenue({ lat: card.venueLat, lng: card.venueLng, state: card.venueGeocodeState }),
    },
    override,
    now,
    t,
  );
}

const OVERRIDE_START = "(SELECT o.starts_at FROM start_override o WHERE o.event_id = listable_event.id)";
const HAS_OVERRIDE = `EXISTS (SELECT 1 FROM start_override o WHERE o.event_id = listable_event.id)`;

/**
 * SQL for `group_eligible=1`: every rule of `isEligible` that a WHERE clause can say, over `listable_event` columns.
 * It never rejects a show `isEligible` accepts. The one rule it only approximates is the venue point (the
 * city-centre placeholder radius needs a haversine), so callers still run `groupEligibility` over what it returns.
 * An operator's start time (`start_override`) turns a date-only show into a timed one and replaces the start the cutoff counts from.
 */
export function groupEligibleClauses(now: Date, t: Tunables = DEFAULT_TUNABLES): { clauses: string[]; params: (string | number)[] } {
  const categories = t.eligibleCategories;
  const closesAt = new Date(now.getTime() + t.joinCutoffHours * 60 * 60 * 1000).toISOString();
  const states = PLACED_GEOCODE_STATES.map(() => "?").join(", ");
  return {
    clauses: [
      `category IN (${categories.map(() => "?").join(", ")})`,
      "is_free = 0",
      "price_min IS NOT NULL AND price_min >= ?",
      `(time_kind = 'timed' OR ${HAS_OVERRIDE})`,
      // Joinable while now < start - cutoff, which is start > now + cutoff.
      `COALESCE(${OVERRIDE_START}, starts_at) > ?`,
      `EXISTS (SELECT 1 FROM venue v WHERE v.id = listable_event.venue_id AND v.geocode_state IN (${states})
         AND v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?)`,
    ],
    params: [
      ...categories,
      t.minPriceInr,
      closesAt,
      ...PLACED_GEOCODE_STATES,
      HYDERABAD_BOX.minLat,
      HYDERABAD_BOX.maxLat,
      HYDERABAD_BOX.minLng,
      HYDERABAD_BOX.maxLng,
    ],
  };
}
