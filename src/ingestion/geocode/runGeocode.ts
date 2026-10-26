import type { Database } from "bun:sqlite";
import { type GeocodeState, isUsablePoint, writeVenueLocation } from "../../catalog/venue.js";
import type { Geocoder } from "./geocoder.js";

export interface GeocodeOptions {
  db: Database;
  /** Tried in order; the first usable point wins. */
  geocoders: Geocoder[];
  limit?: number;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface GeocodeResult {
  considered: number;
  resolved: number;
  failed: number;
  /** Approximate venues no provider improved; they stay at their area centre. */
  unchanged: number;
}

/** Venue names that say there is no place to put on a map. */
const NOT_A_PLACE = /^(online|virtual|zoom|google meet|webinar)\b/i;

interface Candidate {
  id: string;
  name: string;
  address: string | null;
  state: GeocodeState;
}

/**
 * Upgrades pending and approximate venues to a real point. A venue that no
 * provider can place becomes failed if it was pending, and stays approximate if
 * it was approximate. Manual venues are never selected, and writeVenueLocation
 * refuses them anyway. Worst-case venues first: pending before approximate.
 */
export async function runGeocode(options: GeocodeOptions): Promise<GeocodeResult> {
  const { db, geocoders, dryRun = false, log = () => {} } = options;
  const candidates = db
    .prepare(
      `SELECT id, name, address, geocode_state AS state FROM venue
       WHERE geocode_state IN ('pending', 'approximate')
       ORDER BY geocode_state = 'pending' DESC, name
       LIMIT ?`,
    )
    .all(options.limit ?? -1) as Candidate[];

  const result: GeocodeResult = { considered: candidates.length, resolved: 0, failed: 0, unchanged: 0 };
  for (const venue of candidates) {
    // Full address first, then the bare name: a long scraped address often matches nothing a name alone would.
    const name = venue.name.replace(/\s*[:,-]\s*hyderabad$/i, "");
    const queries = NOT_A_PLACE.test(venue.name)
      ? []
      : [
          ...new Set(
            [
              [name, venue.address, "Hyderabad"],
              [name, "Hyderabad"],
            ].map((parts) => parts.filter(Boolean).join(", ")),
          ),
        ];
    let found: { lat: number; lng: number; source: Geocoder["name"] } | null = null;
    search: for (const query of queries) {
      for (const geocoder of geocoders) {
        try {
          const hit = await geocoder.geocode(query);
          if (hit && isUsablePoint(hit.lat, hit.lng)) {
            found = { lat: hit.lat, lng: hit.lng, source: geocoder.name };
            break search;
          }
        } catch (error) {
          log(`  ${geocoder.name} failed for "${venue.name}": ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    if (found) {
      log(`${dryRun ? "would resolve" : "resolved"} ${venue.name} -> ${found.lat}, ${found.lng} (${found.source}, was ${venue.state})`);
      if (!dryRun) writeVenueLocation(db, venue.id, { lat: found.lat, lng: found.lng, state: "resolved", source: found.source });
      result.resolved += 1;
    } else if (venue.state === "pending") {
      log(`${dryRun ? "would fail" : "failed"} ${venue.name}`);
      if (!dryRun) writeVenueLocation(db, venue.id, { lat: null, lng: null, state: "failed", source: null });
      result.failed += 1;
    } else {
      result.unchanged += 1;
    }
  }
  return result;
}
