import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { haversineKm } from "../utils/geo.js";
import { AREA_CENTRES, type LatLng, nearestArea } from "./area.js";

export function normalizeVenueKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Whether a normalised venue key is a stand-in rather than a place. Sources
 * publish these before a venue is confirmed, and an event whose venue is a
 * placeholder cannot be filtered by area or shown on a venue page.
 *
 * The listable_event view (web/schema.ts) encodes the same rule in SQL. test/venue.test.ts
 * checks the two agree.
 */
export function isPlaceholderVenueName(nameKey: string): boolean {
  return (
    nameKey === "tbd" ||
    nameKey === "tba" ||
    nameKey === "venue tbd" ||
    nameKey === "venue tba" ||
    nameKey.includes("to be announced") ||
    nameKey.includes("to be decided")
  );
}

export const GEOCODE_STATES = ["pending", "resolved", "approximate", "failed", "manual"] as const;
export type GeocodeState = (typeof GEOCODE_STATES)[number];

export const GEOCODE_SOURCES = ["source", "nominatim", "google", "area", "manual"] as const;
export type GeocodeSource = (typeof GEOCODE_SOURCES)[number];

/**
 * Greater Hyderabad: ORR, Shamshabad and, at the west edge, Sangareddy (78.09 E),
 * which sources do tag as an area. A point outside it is bad source data.
 */
export const HYDERABAD_BOX = { minLat: 17.2, maxLat: 17.7, minLng: 78.0, maxLng: 78.7 } as const;

/** The generic "Hyderabad" point sources fall back to. A placeholder, not a location. */
const CITY_CENTRE_PLACEHOLDER: LatLng = { lat: 17.385, lng: 78.4867 };
const PLACEHOLDER_RADIUS_KM = 0.05;

export function inHyderabad(lat: number, lng: number): boolean {
  return lat >= HYDERABAD_BOX.minLat && lat <= HYDERABAD_BOX.maxLat && lng >= HYDERABAD_BOX.minLng && lng <= HYDERABAD_BOX.maxLng;
}

/** Whether a point is real: inside the box and not the city-centre placeholder. Anything else counts as missing. */
export function isUsablePoint(lat: number | null | undefined, lng: number | null | undefined): lat is number {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!inHyderabad(lat, lng)) return false;
  return haversineKm(lat, lng, CITY_CENTRE_PLACEHOLDER.lat, CITY_CENTRE_PLACEHOLDER.lng) > PLACEHOLDER_RADIUS_KM;
}

export interface VenuePlacement {
  lat: number | null;
  lng: number | null;
  state: GeocodeState;
  source: GeocodeSource | null;
}

/**
 * Where a venue should sit, given what it holds now and what a source offered.
 * Never called for a manual venue. A real point beats an area centre; an area
 * centre beats nothing; a failed venue stays failed until a point turns up.
 */
export function placeVenue(
  current: VenuePlacement | null,
  offered: { lat: number | null | undefined; lng: number | null | undefined },
  area: string,
): VenuePlacement {
  if (current && current.state !== "approximate" && isUsablePoint(current.lat, current.lng)) {
    return { ...current, state: "resolved", source: current.source ?? "source" };
  }
  if (isUsablePoint(offered.lat, offered.lng)) {
    return { lat: offered.lat, lng: offered.lng!, state: "resolved", source: "source" };
  }
  if (current?.state === "approximate" && isUsablePoint(current.lat, current.lng)) return current;
  const centre = area in AREA_CENTRES ? AREA_CENTRES[area as keyof typeof AREA_CENTRES] : null;
  if (centre && isUsablePoint(centre.lat, centre.lng)) {
    return { lat: centre.lat, lng: centre.lng, state: "approximate", source: "area" };
  }
  return { lat: null, lng: null, state: current?.state === "failed" ? "failed" : "pending", source: null };
}

/**
 * The one writer of a venue's coordinates for automation (the geocode job).
 * Returns false and writes nothing when the venue is manual, the state is not
 * one we define, or the point is not usable. The venue_geocode_* triggers in
 * schema.ts reject bad values from any other writer.
 */
export function writeVenueLocation(
  db: Database,
  venueId: string,
  placement: VenuePlacement,
  nowIso: string = new Date().toISOString(),
  { manual = false }: { manual?: boolean } = {},
): boolean {
  if (!GEOCODE_STATES.includes(placement.state)) return false;
  if (placement.source != null && !GEOCODE_SOURCES.includes(placement.source)) return false;
  const hasPoint = placement.lat != null && placement.lng != null;
  if (hasPoint !== (placement.state === "resolved" || placement.state === "approximate" || placement.state === "manual")) return false;
  if (hasPoint && !isUsablePoint(placement.lat, placement.lng)) return false;
  const row = db.prepare("SELECT geocode_state FROM venue WHERE id = ?").get(venueId) as { geocode_state: string } | null;
  if (!row || (row.geocode_state === "manual" && !manual)) return false;
  db.prepare("UPDATE venue SET lat = ?, lng = ?, geocode_state = ?, geocode_source = ?, geocoded_at = ?, updated_at = ? WHERE id = ?").run(
    placement.lat,
    placement.lng,
    placement.state,
    placement.source,
    nowIso,
    nowIso,
    venueId,
  );
  return true;
}

export interface VenueResolveInput {
  name: string | null | undefined;
  address?: string | null;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nowIso?: string;
}

interface VenueRow extends VenuePlacement {
  id: string;
  address: string | null;
  area: string;
  geocodedAt: string | null;
}

const VENUE_PLACEMENT_SELECT = `SELECT id, lat, lng, address, area, geocode_state AS state,
  geocode_source AS source, geocoded_at AS geocodedAt FROM venue`;

/** A venue with a real point and no known area takes the nearest area within AREA_SNAP_KM. */
function areaFor(area: string, placement: VenuePlacement): string {
  if (area !== "other" || placement.state !== "resolved" || placement.lat == null || placement.lng == null) return area;
  return nearestArea(placement.lat, placement.lng);
}

/**
 * Resolve venue_name_raw → venue.id. Creates venue rows. A point a source sends
 * is copied onto the venue only when it is usable (see isUsablePoint); a venue
 * with none but a known area sits at its area centre, flagged approximate.
 * Manual venues keep their point. No paid geocode.
 */
export function resolveVenueId(db: Database, input: VenueResolveInput): string | null {
  const raw = input.name?.trim() ?? "";
  if (!raw) return null;
  const key = normalizeVenueKey(raw);
  if (!key || isPlaceholderVenueName(key)) return null;

  const nowIso = input.nowIso ?? new Date().toISOString();
  const existing = db.prepare(`${VENUE_PLACEMENT_SELECT} WHERE name_key = ?`).get(key) as VenueRow | null | undefined;

  if (existing) {
    const address = existing.address ?? input.address ?? null;
    const baseArea = existing.area !== "other" ? existing.area : (input.area ?? "other");
    if (existing.state === "manual") {
      db.prepare("UPDATE venue SET address = ?, area = ?, updated_at = ? WHERE id = ?").run(
        address,
        areaFor(baseArea, existing),
        nowIso,
        existing.id,
      );
      return existing.id;
    }
    const placement = placeVenue(existing, { lat: input.latitude, lng: input.longitude }, baseArea);
    const changed = placement.lat !== existing.lat || placement.lng !== existing.lng || placement.state !== existing.state;
    db.prepare(
      `UPDATE venue SET lat = ?, lng = ?, address = ?, area = ?, geocode_state = ?, geocode_source = ?,
         geocoded_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      placement.lat,
      placement.lng,
      address,
      areaFor(baseArea, placement),
      placement.state,
      placement.source,
      changed ? nowIso : existing.geocodedAt,
      nowIso,
      existing.id,
    );
    return existing.id;
  }

  const id = randomUUID();
  const area = input.area ?? "other";
  const placement = placeVenue(null, { lat: input.latitude, lng: input.longitude }, area);
  db.prepare(
    `INSERT INTO venue (
      id, name, name_key, aliases, area, address, lat, lng, google_place_id,
      geocode_state, geocode_source, geocoded_at, venue_type, instagram_handle, is_verified, created_at, updated_at
    ) VALUES (?, ?, ?, '[]', ?, ?, ?, ?, NULL, ?, ?, ?, 'other', NULL, 0, ?, ?)`,
  ).run(
    id,
    raw,
    key,
    areaFor(area, placement),
    input.address ?? null,
    placement.lat,
    placement.lng,
    placement.state,
    placement.source,
    placement.source ? nowIso : null,
    nowIso,
    nowIso,
  );
  return id;
}

/** The area a venue holds, so an event can take it when its own text named none. */
export function venueArea(db: Database, venueId: string | null): string | null {
  if (!venueId) return null;
  const row = db.prepare("SELECT area FROM venue WHERE id = ?").get(venueId) as { area: string } | null;
  return row?.area ?? null;
}

/**
 * Re-applies the coordinate rules to venues stored before they existed:
 * out-of-box and city-centre points go back to pending (or to their area centre),
 * and an `other` venue with a real point takes the nearest area, which its events
 * then inherit. Idempotent; manual venues are skipped.
 */
export function backfillVenueLocations(db: Database): void {
  const venues = db.prepare(`${VENUE_PLACEMENT_SELECT} WHERE geocode_state != 'manual'`).all() as VenueRow[];
  const update = db.prepare(
    `UPDATE venue SET lat = ?, lng = ?, area = ?, geocode_state = ?, geocode_source = ?, geocoded_at = ? WHERE id = ?`,
  );
  const nowIso = new Date().toISOString();
  db.transaction(() => {
    for (const venue of venues) {
      const placement = placeVenue(venue, { lat: null, lng: null }, venue.area);
      const area = areaFor(venue.area, placement);
      const changed = placement.lat !== venue.lat || placement.lng !== venue.lng || placement.state !== venue.state;
      if (!changed && area === venue.area && placement.source === venue.source) continue;
      update.run(
        placement.lat,
        placement.lng,
        area,
        placement.state,
        placement.source,
        changed || !venue.geocodedAt ? nowIso : venue.geocodedAt,
        venue.id,
      );
    }
    db.exec(
      `UPDATE event SET area = (SELECT area FROM venue WHERE venue.id = event.venue_id)
       WHERE area = 'other' AND venue_id IN (SELECT id FROM venue WHERE area != 'other')`,
    );
  })();
}

/** Resolve missing event.venue_id from venue_name (+ optional event lat/lng). Idempotent. */
export function backfillVenueIds(db: Database): { venues: number; eventsUpdated: number } {
  const rows = db
    .prepare(
      `SELECT id, venue_name AS name, address, area, latitude, longitude
       FROM event
       WHERE venue_id IS NULL
         AND venue_name IS NOT NULL
         AND TRIM(venue_name) != ''`,
    )
    .all() as Array<{
    id: string;
    name: string | null;
    address: string | null;
    area: string;
    latitude: number | null;
    longitude: number | null;
  }>;

  const update = db.prepare("UPDATE event SET venue_id = ? WHERE id = ?");
  let eventsUpdated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const venueId = resolveVenueId(db, {
        name: row.name,
        address: row.address,
        area: row.area,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      if (venueId) {
        update.run(venueId, row.id);
        eventsUpdated += 1;
      }
    }
  });
  tx();

  const venues = (db.prepare("SELECT COUNT(*) AS c FROM venue").get() as { c: number }).c;
  return { venues, eventsUpdated };
}
