/**
 * Pure map logic: URL state, filtering, counts, distance sort. No DOM and no
 * MapLibre, so the server renders /map with the same code the browser runs and
 * bun:test covers it.
 */
import { haversineKm } from "../../../utils/geo.js";
import type { MapCollection, MapEvent, MapFeature } from "../types.js";

export const WHEN_VALUES = ["week", "tonight", "weekend"] as const;
export type When = (typeof WHEN_VALUES)[number];

export const GROUP_VALUES = ["type", "day", "venue"] as const;
export type GroupBy = (typeof GROUP_VALUES)[number];

export interface MapFilters {
  when: When;
  category: string | null;
  area: string | null;
  free: boolean;
  q: string;
  /** How the list is grouped; type by default. */
  group: GroupBy;
}

export interface Windows {
  /** Start of the window's first IST day, used for date-only events. */
  dayStart: { tonight: string; weekend: string };
  tonight: { fromIso: string; toIso: string };
  weekend: { fromIso: string; toIso: string };
}

export const DEFAULT_FILTERS: MapFilters = { when: "week", category: null, area: null, free: false, q: "", group: "type" };

/** The key a feature is selected by: its venue id, approximate or not. */
export function selectionKey(feature: MapFeature): string {
  return feature.properties.venueId;
}

function eventMatches(event: MapEvent, filters: MapFilters, windows: Windows, haystack: string): boolean {
  if (filters.category && event.category !== filters.category) return false;
  if (filters.free && !event.isFree) return false;
  if (filters.when !== "week") {
    const { fromIso, toIso } = windows[filters.when];
    // A date-only event has no time to compare, so it counts if its day overlaps the window.
    const from = event.timeKind === "date-only" ? windows.dayStart[filters.when] : fromIso;
    if (event.startsAt < from || event.startsAt > toIso) return false;
  }
  if (filters.q) {
    const text = `${event.title} ${haystack}`.toLowerCase();
    if (
      !filters.q
        .toLowerCase()
        .split(/\s+/)
        .every((word) => text.includes(word))
    )
      return false;
  }
  return true;
}

/** Applies every filter (selection is not one: it narrows the card, not the map). Drops venues left with no events. */
export function filterCollection(data: MapCollection, filters: MapFilters, windows: Windows): MapFeature[] {
  const out: MapFeature[] = [];
  for (const feature of data.features) {
    if (filters.area && feature.properties.area !== filters.area) continue;
    const haystack = `${feature.properties.name} ${feature.properties.area.replace(/-/g, " ")}`;
    const events = feature.properties.events.filter((event) => eventMatches(event, filters, windows, haystack));
    if (events.length) out.push({ ...feature, properties: { ...feature.properties, events } });
  }
  return out;
}

export function counts(features: MapFeature[]): { events: number; venues: number } {
  return { events: features.reduce((sum, f) => sum + f.properties.events.length, 0), venues: features.length };
}

/** Features a selection key refers to; empty when it matches nothing in the current filter. */
export function selected(features: MapFeature[], key: string | null): MapFeature[] {
  if (!key) return [];
  return features.filter((feature) => selectionKey(feature) === key);
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function inBounds(features: MapFeature[], bounds: Bounds): MapFeature[] {
  return features.filter(
    ({
      geometry: {
        coordinates: [lng, lat],
      },
    }) => lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north,
  );
}

/** Venues within `km` of the origin (an approximate venue counts from its area centre). No origin keeps everything. */
export function withinKm(features: MapFeature[], origin: { lat: number; lng: number } | null, km: number): MapFeature[] {
  if (!origin) return features;
  return features.filter(
    ({
      geometry: {
        coordinates: [lng, lat],
      },
    }) => haversineKm(origin.lat, origin.lng, lat, lng) <= km,
  );
}

export interface Ranked {
  feature: MapFeature;
  /** Kilometres from the reader; null when no origin is known. */
  km: number | null;
}

/** Nearest first when an origin is given, else by each venue's first event. Approximate venues carry their area-centre distance. */
export function rank(features: MapFeature[], origin: { lat: number; lng: number } | null): Ranked[] {
  const ranked = features.map((feature) => ({
    feature,
    km: origin ? haversineKm(origin.lat, origin.lng, feature.geometry.coordinates[1], feature.geometry.coordinates[0]) : null,
  }));
  ranked.sort((a, b) =>
    origin
      ? a.km! - b.km! || a.feature.properties.name.localeCompare(b.feature.properties.name)
      : a.feature.properties.events[0]!.startsAt.localeCompare(b.feature.properties.events[0]!.startsAt),
  );
  return ranked;
}

export function categoriesIn(data: MapCollection): string[] {
  return [...new Set(data.features.flatMap((f) => f.properties.events.map((e) => e.category)))].sort();
}

export function areasIn(data: MapCollection): string[] {
  return [...new Set(data.features.map((f) => f.properties.area))].sort();
}
