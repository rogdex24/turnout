import { expect, test } from "bun:test";
import { createElement } from "react";
import {
  counts,
  DEFAULT_FILTERS,
  filterCollection,
  inBounds,
  type MapFilters,
  rank,
  selected,
  selectionKey,
  type Windows,
  withinKm,
} from "../src/web/map/model/filters.js";
import { groupEvents } from "../src/web/map/model/group.js";
import { at, NONE, normalizeSelection, type Selection } from "../src/web/map/model/selection.js";
import { href, loadFilters, sameUrl } from "../src/web/map/model/url.js";
import type { MapCollection, MapEvent, MapFeature } from "../src/web/map/types.js";

const event = (id: string, over: Partial<MapEvent> = {}): MapEvent => ({
  id,
  publicId: id,
  title: `Show ${id}`,
  startsAt: "2026-10-12T14:00:00.000Z",
  category: "comedy",
  priceMin: 500,
  isFree: false,
  moreDates: 0,
  timeKind: "timed",
  source: "district",
  sourceUrl: "https://example.test/e",
  imageUrl: null,
  organiser: null,
  ...over,
});
const feature = (
  venueId: string,
  name: string,
  lng: number,
  lat: number,
  events: MapEvent[],
  over: Partial<MapFeature["properties"]> = {},
): MapFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { venueId, name, area: "madhapur", precision: "exact", trust: { events: 1, sources: 1 }, events, ...over },
});
const data: MapCollection = {
  type: "FeatureCollection",
  excludedNoLocation: 0,
  organisers: {},
  features: [
    feature("v1", "Near Hall", 78.39, 17.45, [event("a"), event("b", { category: "music", isFree: true })]),
    feature("v2", "Far Hall", 78.55, 17.35, [event("c", { startsAt: "2026-10-15T14:00:00.000Z" })], { area: "uppal" }),
    feature("v3", "Rough Cafe", 78.35, 17.44, [event("d")], { area: "gachibowli", precision: "approximate" }),
  ],
};
const windows: Windows = {
  dayStart: { tonight: "2026-10-11T00:00:00.000Z", weekend: "2026-10-15T00:00:00.000Z" },
  tonight: { fromIso: "2026-10-11T11:30:00.000Z", toIso: "2026-10-11T18:29:59.999Z" },
  weekend: { fromIso: "2026-10-15T00:00:00.000Z", toIso: "2026-10-17T18:29:59.999Z" },
};
const f = (over: object) => ({ ...DEFAULT_FILTERS, ...over });

/** What the URL says: the filters plus the raw venue and event strings the selection is resolved from. */
const RAW = { ...DEFAULT_FILTERS, venue: null, event: null };
const query = (state: MapFilters, selection: Selection = NONE) => href(at(state, selection)).slice("/map".length);
const parse = (search: string) => loadFilters(new URLSearchParams(search));

test("filters round-trip through the URL and defaults stay out of it", () => {
  expect(href(at(DEFAULT_FILTERS))).toBe("/map");
  const state = f({ when: "weekend", category: "comedy", free: true, q: "stand up" });
  expect(parse(query(state, { kind: "venue", venueId: "v1" }))).toEqual({ ...state, venue: "v1", event: null });
  expect(parse("when=nonsense").when).toBe("week");
  // Key order is stable, so links are too.
  expect(query(state, { kind: "venue", venueId: "v1" })).toBe("?when=weekend&category=comedy&free=1&q=stand+up&venue=v1");
  // An open event writes its venue too, so the link means the same without the data.
  expect(query(state, { kind: "event", venueId: "v1", eventId: "a" })).toBe(
    "?when=weekend&category=comedy&free=1&q=stand+up&venue=v1&event=a",
  );
});

test("free reads 1, true and on, writes only 1, and an empty value means unset", () => {
  for (const value of ["1", "true", "on"]) expect(parse(`free=${value}`).free).toBe(true);
  for (const value of ["0", "no", ""]) expect(parse(`free=${value}`).free).toBe(false);
  expect(query(f({ free: true }))).toBe("?free=1");
  expect(parse("category=&area=&venue=&event=")).toEqual(RAW);
  expect(parse("q=%20%20jazz%20%20").q).toBe("jazz"); // trimmed
});

test("sameUrl is true only when two states write the same URL, so applying unchanged filters adds no history entry", () => {
  const music = { ...RAW, category: "music" };
  expect(sameUrl(music, { ...music })).toBe(true);
  expect(sameUrl(music, { ...music, q: "" })).toBe(true); // a default is not written, so it cannot differ
  expect(sameUrl(music, { ...music, category: "comedy" })).toBe(false);
  expect(sameUrl(music, { ...music, venue: "v1" })).toBe(false);
});

test("the venue and event in a URL resolve once against the data (D6)", () => {
  const features = [feature("v1", "One", 78.4, 17.4, [event("a"), event("b")]), feature("v2", "Two", 78.5, 17.5, [event("c")])];
  const resolve = (venue: string | null, ev: string | null) => {
    const r = normalizeSelection(features, venue, ev);
    return [r.kind === "none" ? null : r.venueId, r.kind === "event" ? r.eventId : null];
  };
  expect(resolve(null, "c")).toEqual(["v2", "c"]); // an event brings its venue
  expect(resolve("v1", "c")).toEqual(["v2", "c"]); // and beats a mismatched one
  expect(resolve("v1", "nope")).toEqual(["v1", null]);
  expect(resolve("nope", null)).toEqual([null, null]);
  expect(normalizeSelection(features, "nope", "nope")).toBe(NONE); // nothing selected is always the one object, so nothing re-renders
});

test("category, free, area and search narrow events and drop emptied venues", () => {
  expect(counts(filterCollection(data, DEFAULT_FILTERS, windows))).toEqual({ events: 4, venues: 3 });
  expect(counts(filterCollection(data, f({ category: "music" }), windows))).toEqual({ events: 1, venues: 1 });
  expect(counts(filterCollection(data, f({ free: true }), windows))).toEqual({ events: 1, venues: 1 });
  expect(counts(filterCollection(data, f({ area: "uppal" }), windows))).toEqual({ events: 1, venues: 1 });
  expect(counts(filterCollection(data, f({ q: "far hall" }), windows))).toEqual({ events: 1, venues: 1 });
  expect(counts(filterCollection(data, f({ q: "show d rough" }), windows))).toEqual({ events: 1, venues: 1 });
});

test("tonight and weekend use the server-provided windows", () => {
  expect(counts(filterCollection(data, f({ when: "tonight" }), windows))).toEqual({ events: 0, venues: 0 });
  expect(filterCollection(data, f({ when: "weekend" }), windows).map((x) => x.properties.venueId)).toEqual(["v2"]);
});

test("every venue is selected by its id, approximate ones included", () => {
  const all = filterCollection(data, DEFAULT_FILTERS, windows);
  expect(selectionKey(all[0]!)).toBe("v1");
  expect(selectionKey(all[2]!)).toBe("v3");
  expect(selected(all, "v3").map((x) => x.properties.venueId)).toEqual(["v3"]);
  expect(selected(all, "area:gachibowli")).toEqual([]);
});

test("rank sorts nearest first from an origin, and by first event without one", () => {
  const all = filterCollection(data, DEFAULT_FILTERS, windows);
  const byDistance = rank(all, { lat: 17.35, lng: 78.55 });
  expect(byDistance.map((r) => r.feature.properties.venueId)).toEqual(["v2", "v1", "v3"]);
  expect(byDistance[0]!.km).toBeCloseTo(0, 1);
  expect(rank(all, null)[0]!.km).toBeNull();
});

test("withinKm keeps venues inside the radius, and everything when there is no origin", () => {
  const all = filterCollection(data, DEFAULT_FILTERS, windows);
  const origin = { lat: 17.35, lng: 78.55 };
  const far = Math.max(...rank(all, origin).map((r) => r.km!));
  expect(withinKm(all, origin, 1).map((f) => f.properties.venueId)).toEqual(["v2"]);
  expect(withinKm(all, origin, far)).toHaveLength(all.length);
  expect(withinKm(all, origin, far - 0.01)).toHaveLength(all.length - 1);
  expect(withinKm(all, null, 1)).toBe(all);
});

test("inBounds keeps what the viewport shows", () => {
  const all = filterCollection(data, DEFAULT_FILTERS, windows);
  expect(inBounds(all, { west: 78.3, east: 78.4, south: 17.4, north: 17.5 }).map((x) => x.properties.venueId)).toEqual(["v1", "v3"]);
});

test("groupEvents puts the biggest type first and days in date order, nearest first inside", () => {
  const all = filterCollection(data, DEFAULT_FILTERS, windows);
  const byType = groupEvents(rank(all, null), "type");
  expect(byType.map((g) => [g.key, g.items.length])).toEqual([
    ["comedy", 3],
    ["music", 1],
  ]);
  const withOther = groupEvents(
    rank(
      [
        ...all,
        {
          ...all[0]!,
          properties: { ...all[0]!.properties, venueId: "v9", events: [1, 2, 3, 4, 5].map((n) => event(`o${n}`, { category: "other" })) },
        },
      ],
      null,
    ),
    "type",
  );
  expect(withOther.at(-1)!.key).toBe("other"); // the biggest group, still last
  const near = groupEvents(rank(all, { lat: 17.35, lng: 78.55 }), "type")[0]!;
  expect(near.items[0]!.feature.properties.venueId).toBe("v2");
  const byDay = groupEvents(rank(all, null), "day");
  expect(byDay.map((g) => g.key)).toEqual([...byDay.map((g) => g.key)].sort());
  expect(byDay.flatMap((g) => g.items)).toHaveLength(4);
});

test("group is in the URL only when it is not the default", () => {
  expect(parse("group=day").group).toBe("day");
  expect(parse("group=nope").group).toBe("type");
  expect(href(at({ ...DEFAULT_FILTERS, group: "venue" }))).toBe("/map?group=venue");
  expect(href(at(DEFAULT_FILTERS))).toBe("/map");
});

test("list sections render open unless the reader collapsed them", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ResultsPanel } = await import("../src/web/map/components/ResultsPanel.js");
  const ranked = rank(filterCollection(data, DEFAULT_FILTERS, windows), null);
  const render = (filters: MapFilters, collapsed: string[]) =>
    renderToStaticMarkup(
      createElement(ResultsPanel, {
        ranked,
        filters,
        selection: NONE,
        organisers: {},
        collapsed,
        inView: false,
        unplaced: 0,
        onSection: () => {},
      }),
    );
  // Each section is an accordion item; Base UI marks it data-open or data-closed.
  const open = (html: string, key: string) => {
    const tag = new RegExp(`<div [^>]*data-section="${key}"[^>]*>`).exec(html)?.[0] ?? "";
    expect(tag).not.toBe("");
    return tag.includes("data-open");
  };
  expect(open(render(DEFAULT_FILTERS, []), "type:comedy")).toBe(true);
  const some = render(DEFAULT_FILTERS, ["type:comedy"]);
  expect(open(some, "type:comedy")).toBe(false);
  expect(open(some, "type:music")).toBe(true);
  expect(open(render({ ...DEFAULT_FILTERS, group: "venue" }, ["venue:v1"]), "venue:v1")).toBe(false);
});

test("the session reducer keeps folded sections, the sheet detent and the location union", async () => {
  const { initialSession, reduce, nearby } = await import("../src/web/map/model/state.js");
  let s = initialSession("peek");
  s = reduce(s, { type: "section", key: "type:comedy", open: false });
  s = reduce(s, { type: "section", key: "type:comedy", open: false });
  expect(s.collapsed).toEqual(["type:comedy"]);
  s = reduce(s, { type: "section", key: "type:comedy", open: true });
  expect(s.collapsed).toEqual([]);
  expect(reduce(s, { type: "radius", km: 9 })).toBe(s); // no radius without Near me
  s = reduce(reduce(s, { type: "locate-start" }), { type: "locate-found", origin: { lat: 17.4, lng: 78.4 } });
  expect(nearby(s.location)).toEqual({ origin: { lat: 17.4, lng: 78.4 }, km: 4 });
  s = reduce(s, { type: "radius", km: 9 });
  expect(nearby(s.location)?.km).toBe(9);
  expect(nearby(reduce(s, { type: "locate-denied" }).location)).toBeNull();
  expect(reduce(s, { type: "sheet", detent: "full" }).sheet).toBe("full");
});
