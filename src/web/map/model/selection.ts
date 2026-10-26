import type { MapFeature } from "../types.js";
import type { MapFilters } from "./filters.js";

/** What the reader has open: nothing, a venue's card, or one expanded event inside its venue's card. */
export type Selection = { kind: "none" } | { kind: "venue"; venueId: string } | { kind: "event"; venueId: string; eventId: string };

export const NONE: Selection = { kind: "none" };

/**
 * What /map shows, as one value: the filters, and the selection already resolved against the data. The URL's raw `venue` and
 * `event` strings are turned into the selection once, in `normalizeSelection`; from there on nothing carries them as a pair.
 */
export interface MapState {
  filters: MapFilters;
  selection: Selection;
}

export const at = (filters: MapFilters, selection: Selection = NONE): MapState => ({ filters, selection });
export const venueOf = (venueId: string): Selection => ({ kind: "venue", venueId });

/** The venue a selection is in, or null. */
export const selectedVenue = (selection: Selection): string | null => (selection.kind === "none" ? null : selection.venueId);
/** The event a selection has open, or null. */
export const selectedEvent = (selection: Selection): string | null => (selection.kind === "event" ? selection.eventId : null);

/**
 * Resolves the raw `venue` and `event` from a URL against the data, once (D6).
 * An event always belongs to the venue that lists it, so a mismatched `venue` loses to the event's real host.
 * A known venue with an unknown event keeps the venue (R1: a shared link to an event that has ended should still land on its
 * venue, not on an empty map). An unknown venue with no known event is `none`, which is always the one `NONE` object.
 */
export function normalizeSelection(features: MapFeature[], venue: string | null, event: string | null): Selection {
  const host = event ? features.find((f) => f.properties.events.some((e) => e.publicId === event)) : undefined;
  if (host) return { kind: "event", venueId: host.properties.venueId, eventId: event! };
  if (venue && features.some((f) => f.properties.venueId === venue)) return { kind: "venue", venueId: venue };
  return NONE;
}
