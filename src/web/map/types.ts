/** Shapes shared by /api/map, the server-rendered /map page and the browser client. */

export interface MapEvent {
  id: string;
  publicId: string;
  title: string;
  startsAt: string;
  /** date-only: the source gave a day and no time, so no time is shown (DESIGN.md). */
  timeKind: "timed" | "date-only";
  category: string;
  priceMin: number | null;
  isFree: boolean;
  /** Further dates of the same run, beyond startsAt. */
  moreDates: number;
  /** Source key, for the "View on <source>" button and credits. */
  source: string;
  /** The source page, only when it passes the public link check; null otherwise. */
  sourceUrl: string | null;
  /** Absolute https cover URL, or null when the source sends none. */
  imageUrl: string | null;
  organiser: string | null;
}

/** Our own counts for a trust line: listed events this month and how many sources they came from. */
export interface Trust {
  events: number;
  sources: number;
}

export interface MapVenueProperties {
  venueId: string;
  name: string;
  area: string;
  precision: "exact" | "approximate";
  trust: Trust;
  events: MapEvent[];
}

export interface MapFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: MapVenueProperties;
}

export interface MapCollection {
  type: "FeatureCollection";
  features: MapFeature[];
  /** Listed events in the window whose venue has no usable point. */
  excludedNoLocation: number;
  /** Trust counts for each organiser named on a returned event. */
  organisers: Record<string, Trust>;
}
