/**
 * The URL of /map as one nuqs descriptor (D4). The browser reads and writes it with `useQueryStates`; the server parses
 * the request with `loadFilters` and builds every link with `href`, from the same parsers, so the two cannot disagree.
 * Defaults are left out of the URL, so the default page has a clean one.
 *
 * The URL carries `venue` and `event` as two strings (`RawUrl`). They are resolved against the data once, into a `Selection`
 * (selection.ts); every link is built from a `MapState`, whose selection is written back out as the pair a link needs.
 */
import { createLoader, createParser, createSerializer, parseAsStringLiteral } from "nuqs/server";
import { GROUP_VALUES, type MapFilters, WHEN_VALUES } from "./filters.js";
import { type MapState, selectedEvent, selectedVenue } from "./selection.js";

/** A string that is null when empty, so `?category=` means no category. */
const text = createParser<string>({ parse: (value) => value || null, serialize: (value) => value });

export const filterParsers = {
  when: parseAsStringLiteral(WHEN_VALUES).withDefault("week"),
  category: text,
  area: text,
  // `1`, `true` and `on` all mean free; only `1` is written.
  free: createParser<boolean>({
    parse: (value) => ["1", "true", "on"].includes(value),
    serialize: (value) => (value ? "1" : "0"),
  }).withDefault(false),
  q: createParser<string>({ parse: (value) => value.trim() || null, serialize: (value) => value }).withDefault(""),
  venue: text,
  event: text,
  group: parseAsStringLiteral(GROUP_VALUES).withDefault("type"),
};

/** What the URL says, before it is checked against the data. */
export type RawUrl = MapFilters & { venue: string | null; event: string | null };

export const loadFilters = createLoader(filterParsers);
const serialize = createSerializer(filterParsers);

/** The URL's filters, without the raw selection strings. */
export const filtersOf = ({ venue: _venue, event: _event, ...filters }: RawUrl): MapFilters => filters;

/** The /map link for a state. An open event also writes its venue, so the link means the same without the data. */
export const href = ({ filters, selection }: MapState): string =>
  `/map${serialize({ ...filters, venue: selectedVenue(selection), event: selectedEvent(selection) })}`;

/** Whether two states write the same URL. Defaults are left out, so they compare as the URL does. */
export const sameUrl = (a: RawUrl, b: RawUrl): boolean => serialize(a) === serialize(b);

/** Filters from a submitted form. The form leaves out the venue and event, so submitting closes any open card. */
export const filtersFromForm = (form: HTMLFormElement): MapFilters =>
  filtersOf(loadFilters(new URLSearchParams(new FormData(form) as unknown as Record<string, string>)));
