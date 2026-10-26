interface OccurrenceFields {
  sourceEventId: string;
  sourceSlotId: string;
  slug: string | null;
  title: string;
  description: string | null;
  startsAt: string; // UTC instant for timed rows; IST-midnight date anchor otherwise
  venueName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  tags: string[];
  priceMin: number | null;
  isFree: boolean;
  sourceUrl: string;
  /** Absolute https cover URL, when the source sends one. */
  imageUrl?: string | null;
  organiser?: string | null;
}

export type Occurrence = OccurrenceFields & ({ timeKind: "timed"; endsAt: string | null } | { timeKind: "date-only"; endsAt: null });

export interface EventRow {
  id: string;
  source: string;
  sourceEventId: string;
  title: string;
  venueName: string | null;
  timeKind: "timed" | "date-only";
  startsAt: string;
  firstSeenAt: string;
}
