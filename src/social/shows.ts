import type { Database } from "bun:sqlite";
import { isPlacedVenue } from "../catalog/venue.js";
import { isEligible } from "./model/eligibility.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";

/** A show a group can be made for, as a plan snapshots it. `startsAt` is the operator's time when there is one. */
export interface ShowRow {
  id: string;
  title: string;
  source: string;
  category: string;
  priceMin: number | null;
  area: string;
  venueName: string;
  venueLat: number | null;
  venueLng: number | null;
  startsAt: string;
  joinUntil: string;
  /** The event's dedupe group, or its own id: one live plan per member per run of the same show. */
  dedupeKey: string;
}

interface ShowQueryRow {
  id: string;
  title: string;
  source: string;
  category: string;
  price_min: number | null;
  is_free: number;
  time_kind: "timed" | "date-only";
  starts_at: string;
  override_starts_at: string | null;
  area: string;
  venue_name: string | null;
  venue_row_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_geocode_state: string | null;
  dedupe_key: string;
}

/** The show for this public id when a group can be made for it at `now`, else null (missing, unlisted, free, closed, no placed venue). */
export function getEligibleShow(db: Database, eventId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): ShowRow | null {
  const row = db
    .query(
      `SELECT s.id, s.title, s.source, s.category, s.price_min, s.is_free, s.time_kind, s.starts_at, s.override_starts_at, s.area,
              s.venue_name, v.name AS venue_row_name, s.venue_lat, s.venue_lng, s.venue_geocode_state,
              COALESCE(s.dedupe_group_id, s.id) AS dedupe_key
       FROM eligible_show s JOIN venue v ON v.id = s.venue_id WHERE s.id = ?`,
    )
    .get(eventId) as ShowQueryRow | null;
  if (row === null) return null;
  const verdict = isEligible(
    {
      category: row.category,
      isFree: row.is_free === 1,
      priceMin: row.price_min,
      startsAt: row.starts_at,
      timeKind: row.time_kind,
      venuePlaced: isPlacedVenue({ lat: row.venue_lat, lng: row.venue_lng, state: row.venue_geocode_state }),
    },
    row.override_starts_at === null ? null : { startsAt: row.override_starts_at },
    now,
    t,
  );
  if (!verdict.eligible) return null;
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    category: row.category,
    priceMin: row.price_min,
    area: row.area,
    venueName: row.venue_name ?? row.venue_row_name,
    venueLat: row.venue_lat,
    venueLng: row.venue_lng,
    startsAt: verdict.startsAt,
    joinUntil: verdict.joinUntil,
    dedupeKey: row.dedupe_key,
  };
}

/** How many people are waiting for a group for this show. */
export function lookingCount(db: Database, eventId: string): number {
  const row = db.query("SELECT COUNT(*) AS n FROM plan WHERE event_id = ? AND state = 'finding_group'").get(eventId) as { n: number };
  return row.n;
}
