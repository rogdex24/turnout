import type { Category } from "../catalog/category.js";

/** One event as the site reads it: the listing, detail, API and ICS shape. */
export interface EventCard {
  id: string;
  sourceEventId: string;
  publicId: string;
  title: string;
  timeKind: "timed" | "date-only";
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  area: string;
  latitude: number | null;
  longitude: number | null;
  /** The venue row's point and state, which the placed-venue rule reads. The event's own latitude is not used for that. */
  venueLat: number | null;
  venueLng: number | null;
  venueGeocodeState: string | null;
  /** The operator's confirmed start (`start_override`), which the group rule prefers to `startsAt`. Null when there is none. */
  overrideStartsAt: string | null;
  categories: string;
  category: Category;
  isFree: number;
  priceMin: number | null;
  source: string;
  sourceUrl: string;
  description: string | null;
}

export type NowFn = () => Date;

export interface ListingFilters {
  area: string | null;
  category: string | null;
  source: string | null;
  free: boolean;
  from: string | null;
  to: string | null;
  /** Precise ISO bounds (override from/to day strings when set). */
  fromIso: string | null;
  toIso: string | null;
  maxPrice: number | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  venueId: string | null;
  /** Only shows a group can be made for (`group_eligible=1`). */
  groupEligible: boolean;
}

/**
 * How many events each filter value would show, so the reader can see what is
 * worth clicking instead of picking a value that returns nothing.
 *
 * Counted over the listing's date window and eligibility only. The other active
 * filters are deliberately ignored, so a facet's numbers do not shift as the
 * reader narrows an unrelated one.
 */
export interface FacetCounts {
  category: Map<string, number>;
  source: Map<string, number>;
  area: Map<string, number>;
  total: number;
}

export interface ListingEntry {
  row: EventCard;
  /** Further dates of the same run, beyond the one this card shows. */
  moreDates: number;
}

export type EventCursor =
  | { kind: "time"; startsAt: string; id: string }
  | { kind: "distance"; startsAt: string; id: string; distance: number };
