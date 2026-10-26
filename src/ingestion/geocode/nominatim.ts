import { HYDERABAD_BOX } from "../../catalog/venue.js";
import { type FetchLike, sleep, USER_AGENT } from "../../utils/http.js";
import type { GeocodeHit, Geocoder } from "./geocoder.js";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
/**
 * Usage policy (operations.osmfoundation.org/policies/nominatim): at most 1
 * request per second, an identifying User-Agent, results cached, a single
 * thread. A recurring or day-long bulk script is held to 4 per minute, so pass
 * minIntervalMs: 15_000 if this ever runs on a schedule.
 */
const DEFAULT_MIN_INTERVAL_MS = 1100;

export interface NominatimOptions {
  fetchImpl?: FetchLike;
  minIntervalMs?: number;
}

export function nominatimGeocoder(options: NominatimOptions = {}): Geocoder {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const cache = new Map<string, GeocodeHit | null>();
  let lastRequestAt = 0;

  return {
    name: "nominatim",
    async geocode(query) {
      const key = query.trim().toLowerCase();
      if (cache.has(key)) return cache.get(key) ?? null;

      const wait = lastRequestAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();

      const { minLng, maxLat, maxLng, minLat } = HYDERABAD_BOX;
      const url = `${ENDPOINT}?${new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "1",
        countrycodes: "in",
        viewbox: `${minLng},${maxLat},${maxLng},${minLat}`,
        bounded: "1",
      })}`;
      const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
      if (!response.ok) throw new Error(`Nominatim ${response.status}`);
      const results = (await response.json()) as Array<{ lat: string; lon: string; place_id?: number }>;
      const first = results[0];
      const hit = first
        ? { lat: Number(first.lat), lng: Number(first.lon), placeId: first.place_id ? String(first.place_id) : undefined }
        : null;
      cache.set(key, hit);
      return hit;
    },
  };
}
