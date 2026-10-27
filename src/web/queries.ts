import type { Database } from "bun:sqlite";
import { AREAS } from "../catalog/area.js";
import { isCategory } from "../catalog/category.js";
import { haversineKm } from "../utils/geo.js";
import { endOfDayIst, istCalendarDate, startOfDayIst } from "../utils/time.js";
import { groupEligibility, groupEligibleClauses } from "./groupEligible.js";
import { PublicInputError } from "./input.js";
import type { EventCard, EventCursor, FacetCounts, ListingFilters, NowFn } from "./types.js";

const EVENT_SELECT = `SELECT id, source_event_id AS sourceEventId,
              id AS publicId,
              title, time_kind AS timeKind, starts_at AS startsAt, ends_at AS endsAt, venue_name AS venueName, address,
              area, latitude, longitude,
              (SELECT v.lat FROM venue v WHERE v.id = listable_event.venue_id) AS venueLat,
              (SELECT v.lng FROM venue v WHERE v.id = listable_event.venue_id) AS venueLng,
              (SELECT v.geocode_state FROM venue v WHERE v.id = listable_event.venue_id) AS venueGeocodeState,
              categories, category, is_free AS isFree, price_min AS priceMin, source, source_url AS sourceUrl,
              description
       FROM listable_event`;

export function parseCategories(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function readFilters(url: URL): ListingFilters {
  const value = (name: string) => url.searchParams.get(name) || null;
  const number = (name: string): number | null => {
    const raw = value(name);
    if (raw === null) return null;
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed)) throw new PublicInputError(`invalid ${name}`);
    return parsed;
  };
  const date = (name: string): string | null => {
    const raw = value(name);
    if (raw === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) {
      throw new PublicInputError(`invalid ${name}`);
    }
    return raw;
  };
  const filters = emptyFilters();
  filters.area = value("area");
  filters.category = value("category");
  filters.source = value("source");
  filters.from = date("from");
  filters.to = date("to");
  filters.maxPrice = number("max_price");
  filters.lat = number("lat");
  filters.lng = number("lng");
  filters.radiusKm = number("radius_km");
  const free = value("free");
  if (free !== null && !["true", "1", "on", "false", "0", "off"].includes(free)) throw new PublicInputError("invalid free");
  filters.free = free === "true" || free === "1" || free === "on";
  const groupEligible = value("group_eligible");
  if (groupEligible !== null && !["1", "0"].includes(groupEligible)) throw new PublicInputError("invalid group_eligible");
  filters.groupEligible = groupEligible === "1";
  if (filters.area && !(AREAS as readonly string[]).includes(filters.area)) throw new PublicInputError("invalid area");
  if (filters.category && !isCategory(filters.category)) throw new PublicInputError("invalid category");
  if (filters.from && filters.to && filters.from > filters.to) throw new PublicInputError("inverted date range");
  if (filters.maxPrice !== null && filters.maxPrice < 0) throw new PublicInputError("invalid max_price");
  if ((filters.lat === null) !== (filters.lng === null)) throw new PublicInputError("lat and lng must be supplied together");
  if (filters.lat !== null && Math.abs(filters.lat) > 90) throw new PublicInputError("invalid lat");
  if (filters.lng !== null && Math.abs(filters.lng) > 180) throw new PublicInputError("invalid lng");
  if (filters.radiusKm !== null && (filters.lat === null || filters.radiusKm <= 0)) throw new PublicInputError("invalid radius_km");
  return filters;
}

export function emptyFilters(): ListingFilters {
  return {
    area: null,
    category: null,
    source: null,
    free: false,
    from: null,
    to: null,
    fromIso: null,
    toIso: null,
    maxPrice: null,
    lat: null,
    lng: null,
    radiusKm: null,
    venueId: null,
    groupEligible: false,
  };
}

/** The date range a listing covers, from explicit bounds or the default window. */
function listingWindow(filters: ListingFilters, now: NowFn, defaultDays: number): { fromIso: string; toIso: string } {
  const start = now();
  return {
    fromIso: filters.fromIso ?? (filters.from ? startOfDayIst(filters.from) : start.toISOString()),
    toIso:
      filters.toIso ??
      (filters.to ? endOfDayIst(filters.to) : new Date(start.getTime() + Math.max(defaultDays, 0) * 24 * 60 * 60 * 1000).toISOString()),
  };
}

/** One page, or with `group_eligible` a page of only the shows `isEligible` accepts (see `groupEligibleClauses`). */
function queryEvents(
  db: Database,
  filters: ListingFilters,
  now: NowFn,
  limit: number,
  defaultDays: number,
  after: EventCursor | null,
): EventCard[] {
  if (!filters.groupEligible) return queryEventsOnce(db, filters, now, limit, defaultDays, after);
  const wantDistance = filters.lat != null && filters.lng != null;
  const at = now();
  const accepted = (row: EventCard) => groupEligibility(row, at).eligible;
  // Distance order reads every candidate anyway, so one pass is enough.
  if (wantDistance) return queryEventsOnce(db, filters, now, limit, defaultDays, after).filter(accepted);
  // The SQL clauses leave out only the placeholder-radius check, so a batch is nearly always all accepted. When it
  // is not, read on from the last row so a page is still full.
  const out: EventCard[] = [];
  let cursor = after;
  for (;;) {
    const batch = queryEventsOnce(db, filters, now, limit, defaultDays, cursor);
    for (const row of batch) if (accepted(row)) out.push(row);
    const last = batch[batch.length - 1];
    if (out.length >= limit || batch.length < limit || !last) return out.slice(0, limit);
    cursor = { kind: "time", startsAt: last.startsAt, id: last.id };
  }
}

function queryEventsOnce(
  db: Database,
  filters: ListingFilters,
  now: NowFn,
  limit: number,
  defaultDays: number,
  after: EventCursor | null,
): EventCard[] {
  const { fromIso, toIso } = listingWindow(filters, now, defaultDays);

  const clauses = ["(starts_at >= ? OR (time_kind = 'date-only' AND starts_at >= ?))", "starts_at < ?"];
  const params: (string | number)[] = [fromIso, filters.fromIso ? fromIso : startOfDayIst(istCalendarDate(new Date(fromIso))), toIso];

  if (filters.area) {
    clauses.push("area = ?");
    params.push(filters.area);
  }
  if (filters.category) {
    clauses.push("category = ?");
    params.push(filters.category);
  }
  if (filters.source) {
    clauses.push("source = ?");
    params.push(filters.source);
  }
  if (filters.free) {
    clauses.push("is_free = 1");
  }
  if (filters.maxPrice != null) {
    clauses.push("(is_free = 1 OR (price_min IS NOT NULL AND price_min <= ?))");
    params.push(filters.maxPrice);
  }
  if (filters.venueId) {
    clauses.push("venue_id = ?");
    params.push(filters.venueId);
  }
  if (filters.groupEligible) {
    const eligible = groupEligibleClauses(now());
    clauses.push(...eligible.clauses);
    params.push(...eligible.params);
  }

  const wantDistance = filters.lat != null && filters.lng != null;
  if (after?.kind === "time") {
    clauses.push("(starts_at > ? OR (starts_at = ? AND id > ?))");
    params.push(after.startsAt, after.startsAt, after.id);
  }
  // Distance ordering must consider every eligible row before trimming a page.
  if (!wantDistance) params.push(limit);
  let rows = db
    .prepare(
      `${EVENT_SELECT}
       WHERE ${clauses.join(" AND ")}
       ORDER BY starts_at ASC, id ASC
       ${wantDistance ? "" : "LIMIT ?"}`,
    )
    .all(...params) as EventCard[];

  if (wantDistance) {
    const lat = filters.lat!;
    const lng = filters.lng!;
    const withDist = rows
      .filter((row) => row.latitude != null && row.longitude != null)
      .map((row) => ({
        row,
        km: haversineKm(lat, lng, row.latitude!, row.longitude!),
      }));
    const filtered = filters.radiusKm != null ? withDist.filter((x) => x.km <= filters.radiusKm!) : withDist;
    filtered.sort((a, b) => a.km - b.km || a.row.startsAt.localeCompare(b.row.startsAt) || a.row.id.localeCompare(b.row.id));
    const remaining =
      after?.kind === "distance"
        ? filtered.filter(
            ({ row, km }) =>
              km > after.distance ||
              (km === after.distance && (row.startsAt > after.startsAt || (row.startsAt === after.startsAt && row.id > after.id))),
          )
        : filtered;
    rows = remaining.slice(0, limit).map((x) => x.row);
  }

  return rows;
}

export function queryListingEvents(db: Database, filters: ListingFilters, now: NowFn, limit: number, defaultDays: number): EventCard[] {
  return queryEvents(db, filters, now, limit, defaultDays, null);
}

export function queryEventPage(db: Database, filters: ListingFilters, now: NowFn, limit: number, after: EventCursor | null): EventCard[] {
  return queryEvents(db, filters, now, limit, 7, after);
}

export function cursorForEvent(row: EventCard, filters: ListingFilters): EventCursor {
  if (filters.lat !== null && filters.lng !== null) {
    return {
      kind: "distance",
      startsAt: row.startsAt,
      id: row.id,
      distance: haversineKm(filters.lat, filters.lng, row.latitude!, row.longitude!),
    };
  }
  return { kind: "time", startsAt: row.startsAt, id: row.id };
}

export function facetCounts(db: Database, filters: ListingFilters, now: NowFn, defaultDays: number): FacetCounts {
  const { fromIso, toIso } = listingWindow(filters, now, defaultDays);
  const countBy = (column: "category" | "source" | "area"): Map<string, number> => {
    const rows = db
      .prepare(
        `SELECT ${column} AS value, COUNT(*) AS n FROM listable_event
         WHERE (starts_at >= ? OR (time_kind = 'date-only' AND starts_at >= ?)) AND starts_at < ?
         GROUP BY ${column}`,
      )
      .all(fromIso, filters.fromIso ? fromIso : startOfDayIst(istCalendarDate(new Date(fromIso))), toIso) as {
      value: string | null;
      n: number;
    }[];
    return new Map(rows.filter((row) => row.value).map((row) => [row.value as string, row.n]));
  };

  const category = countBy("category");
  let total = 0;
  for (const n of category.values()) total += n;
  return { category, source: countBy("source"), area: countBy("area"), total };
}

export function loadEligibleEvent(db: Database, publicId: string): EventCard | null {
  return db
    .prepare(
      `${EVENT_SELECT}
       WHERE id = ? OR (slug = ? AND (SELECT COUNT(*) FROM event WHERE slug = ?) = 1)
       LIMIT 1`,
    )
    .get(publicId, publicId, publicId) as EventCard | null;
}

/**
 * Collapses a multi-date run to a single card. One source record that sells 23
 * dates is 23 occurrence rows, which is right for storage, the calendar feed
 * and the API, but it means a browsing reader scrolls past the same play 23
 * times. The earliest date in the window represents the run.
 *
 * Only the HTML listings do this. /api/events and the ICS feeds keep every
 * occurrence, because a machine consumer wants each bookable date.
 */
export function collapseRuns<T extends { source: string; sourceEventId: string }>(rows: T[]): Array<{ row: T; moreDates: number }> {
  const entries: Array<{ row: T; moreDates: number }> = [];
  const seen = new Map<string, { row: T; moreDates: number }>();

  for (const row of rows) {
    const key = `${row.source}\u0000${row.sourceEventId}`;
    const existing = seen.get(key);
    if (existing) {
      existing.moreDates += 1;
      continue;
    }
    const entry = { row, moreDates: 0 };
    seen.set(key, entry);
    entries.push(entry);
  }
  return entries;
}
