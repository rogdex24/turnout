import type { Database } from "bun:sqlite";
import { isUsablePoint } from "../../catalog/venue.js";
import { endOfDayIst, istCalendarDate, startOfDayIst } from "../../utils/time.js";
import { collapseRuns } from "../queries.js";
import { publicSourceUrl } from "../source-url.js";
import type { NowFn } from "../types.js";
import type { MapCollection, MapFeature, Trust } from "./types.js";

interface Row {
  id: string;
  source: string;
  sourceEventId: string;
  publicId: string;
  title: string;
  startsAt: string;
  timeKind: "timed" | "date-only";
  category: string;
  priceMin: number | null;
  isFree: number;
  sourceUrl: string;
  imageUrl: string | null;
  organiser: string | null;
  venueId: string | null;
  venueName: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  state: string | null;
}

/** Same default window as the listing: now to seven days on. from/to are IST calendar days. */
export function mapWindow(from: string | null, to: string | null, now: NowFn): { fromIso: string; toIso: string } {
  const start = now();
  return {
    fromIso: from ? startOfDayIst(from) : start.toISOString(),
    toIso: to ? endOfDayIst(to) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * One feature per venue with a listed event in the window. Events come only
 * from listable_event. A venue is placed only when its point is usable and its
 * state says it was resolved, approximated or set by hand.
 */
export function loadMap(db: Database, fromIso: string, toIso: string): MapCollection {
  const rows = db
    .prepare(
      `SELECT e.id, e.source, e.source_event_id AS sourceEventId,
              e.id AS publicId,
              e.title, e.starts_at AS startsAt, e.time_kind AS timeKind, e.category, e.price_min AS priceMin, e.is_free AS isFree,
              e.source_url AS sourceUrl, e.image_url AS imageUrl, e.organiser_name AS organiser,
              v.id AS venueId, v.name AS venueName, v.area, v.lat, v.lng, v.geocode_state AS state
       FROM listable_event e LEFT JOIN venue v ON v.id = e.venue_id
       WHERE (e.starts_at >= ? OR (e.time_kind = 'date-only' AND e.starts_at >= ?)) AND e.starts_at < ?
       ORDER BY e.starts_at`,
    )
    // A date-only event today is still on today, so it stays in until the day ends.
    .all(fromIso, startOfDayIst(istCalendarDate(new Date(fromIso))), toIso) as Row[];

  const trust = monthTrust(db, fromIso);
  const venues = new Map<string, MapFeature>();
  let excludedNoLocation = 0;
  for (const { row, moreDates } of collapseRuns(rows)) {
    const placed =
      row.venueId != null &&
      row.lat != null &&
      row.lng != null &&
      isUsablePoint(row.lat, row.lng) &&
      (row.state === "resolved" || row.state === "approximate" || row.state === "manual");
    if (!placed) {
      excludedNoLocation += 1;
      continue;
    }
    let feature = venues.get(row.venueId!);
    if (!feature) {
      feature = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lng!, row.lat!] },
        properties: {
          venueId: row.venueId!,
          name: row.venueName!,
          area: row.area ?? "other",
          precision: row.state === "approximate" ? "approximate" : "exact",
          trust: trust.venues.get(row.venueId!) ?? { events: 0, sources: 0 },
          events: [],
        },
      };
      venues.set(row.venueId!, feature);
    }
    feature.properties.events.push({
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      startsAt: row.startsAt,
      timeKind: row.timeKind,
      category: row.category,
      priceMin: row.priceMin,
      isFree: row.isFree === 1,
      moreDates,
      source: row.source,
      sourceUrl: publicSourceUrl(row.sourceUrl),
      imageUrl: row.imageUrl,
      organiser: row.organiser,
    });
  }
  return { type: "FeatureCollection", features: [...venues.values()], excludedNoLocation, organisers: trust.organisers(venues) };
}

/**
 * Our own counts for the trust line: distinct listed events (a multi-date run is
 * one) and distinct sources, over the IST calendar month containing `fromIso`.
 */
function monthTrust(
  db: Database,
  fromIso: string,
): { venues: Map<string, Trust>; organisers: (v: Map<string, MapFeature>) => Record<string, Trust> } {
  const day = new Date(new Date(fromIso).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const start = startOfDayIst(`${day}-01`);
  const next = new Date(`${day}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const rows = db
    .prepare(
      `SELECT venue_id AS key, COUNT(DISTINCT source || ':' || source_event_id) AS events, COUNT(DISTINCT source) AS sources
       FROM listable_event WHERE starts_at >= ? AND starts_at < ? AND venue_id IS NOT NULL GROUP BY venue_id`,
    )
    .all(start, startOfDayIst(next.toISOString().slice(0, 10))) as Array<{ key: string; events: number; sources: number }>;
  const byOrganiser = new Map(
    (
      db
        .prepare(
          `SELECT organiser_name AS key, COUNT(DISTINCT source || ':' || source_event_id) AS events, COUNT(DISTINCT source) AS sources
         FROM listable_event WHERE starts_at >= ? AND starts_at < ? AND organiser_name IS NOT NULL GROUP BY organiser_name`,
        )
        .all(start, startOfDayIst(next.toISOString().slice(0, 10))) as Array<{ key: string; events: number; sources: number }>
    ).map((r) => [r.key, { events: r.events, sources: r.sources }] as const),
  );
  return {
    venues: new Map(rows.map((r) => [r.key, { events: r.events, sources: r.sources }])),
    // Only organisers named on a returned event, so the response stays small.
    organisers: (shown) => {
      const out: Record<string, Trust> = {};
      for (const f of shown.values())
        for (const e of f.properties.events)
          if (e.organiser && byOrganiser.has(e.organiser)) out[e.organiser] = byOrganiser.get(e.organiser)!;
      return out;
    },
  };
}
