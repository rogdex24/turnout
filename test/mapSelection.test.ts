import { expect, test } from "bun:test";
import { normalizeSelection } from "../src/web/map/model/selection.js";
import type { MapEvent, MapFeature } from "../src/web/map/types.js";

const event = (id: string): MapEvent => ({
  id,
  publicId: id,
  title: id,
  startsAt: "2026-10-11T13:00:00.000Z",
  timeKind: "timed",
  category: "music",
  priceMin: null,
  isFree: false,
  moreDates: 0,
  source: "luma",
  sourceUrl: null,
  imageUrl: null,
  organiser: null,
});
const venue = (venueId: string, ...ids: string[]): MapFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [78.4, 17.4] },
  properties: { venueId, name: venueId, area: "other", precision: "exact", trust: { events: 0, sources: 0 }, events: ids.map(event) },
});
const features = [venue("v1", "a", "b"), venue("v2", "c")];

test("normalizeSelection keeps valid selections", () => {
  expect(normalizeSelection(features, null, null)).toEqual({ kind: "none" });
  expect(normalizeSelection(features, "v2", null)).toEqual({ kind: "venue", venueId: "v2" });
  expect(normalizeSelection(features, "v1", "b")).toEqual({ kind: "event", venueId: "v1", eventId: "b" });
  expect(normalizeSelection(features, null, "c")).toEqual({ kind: "event", venueId: "v2", eventId: "c" });
});

test("normalizeSelection drops unknown ids and fixes a mismatched venue", () => {
  expect(normalizeSelection(features, "nope", null)).toEqual({ kind: "none" });
  expect(normalizeSelection(features, "nope", "nope")).toEqual({ kind: "none" });
  expect(normalizeSelection(features, null, "nope")).toEqual({ kind: "none" });
  expect(normalizeSelection(features, "v1", "nope")).toEqual({ kind: "venue", venueId: "v1" });
  expect(normalizeSelection(features, "v1", "c")).toEqual({ kind: "event", venueId: "v2", eventId: "c" });
  expect(normalizeSelection(features, "nope", "a")).toEqual({ kind: "event", venueId: "v1", eventId: "a" });
});

/** S8 item 8 (D6): the selection is resolved once, and carried as the union, never as an independent venue/event pair. */
import fs from "node:fs";

test("MapFilters has no venue or event, and no component rebuilds the pair from filters", () => {
  const filters = fs.readFileSync("src/web/map/model/filters.ts", "utf8");
  const iface = filters.slice(
    filters.indexOf("export interface MapFilters"),
    filters.indexOf("}", filters.indexOf("export interface MapFilters")),
  );
  expect(iface).not.toMatch(/\b(venue|event)\b/);
  for (const dir of ["src/web/map/components", "src/web/map/model"]) {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name === "url.ts") continue; // url.ts is where the union is written back as the URL's pair
      const text = fs.readFileSync(`${dir}/${name}`, "utf8");
      expect({ name, pair: /\.\.\.filters,\s*venue:|venue:\s*null,\s*event:/.test(text) }).toEqual({ name, pair: false });
    }
  }
});

test("a venue with an unknown event keeps the venue open (R1, S1.3 as revised)", () => {
  expect(normalizeSelection(features, "v1", "gone")).toEqual({ kind: "venue", venueId: "v1" });
  expect(normalizeSelection(features, "nope", "gone")).toEqual({ kind: "none" });
});
