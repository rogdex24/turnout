import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type AllEventsRawEvent,
  dropVenueFloodedTitles,
  parseListingPage,
  parsePrice,
  parseStartsAt,
  toOccurrence,
} from "../src/ingestion/sources/allEvents.js";

const fixture = fs.readFileSync(path.join(import.meta.dir, "fixtures", "allevents-hyderabad-page1.html"), "utf8");

test("parses a real Hyderabad listing page into raw events", () => {
  const events = parseListingPage(fixture);
  expect(events.length).toBe(45);

  const surotsav = events.find((event) => event.title === "Federal Bank Bharat Surotsav")!;
  expect(surotsav.venueName).toBe("Shilpakala Vedika: Hyderabad");
  expect(surotsav.latitude).toBeCloseTo(17.451401, 4);
  expect(surotsav.startsAtText).toBe("Sat, 19 Sep • 06:00 PM");
});

test("every parsed card resolves to a usable occurrence or is deliberately held", () => {
  const events = parseListingPage(fixture);
  const held = events.filter((event) => toOccurrence(event, new Date("2026-09-08T12:00:00Z")) === null);
  expect(held.length).toBe(0);
});

test("parses a bulleted date with no year, rolling to next year only when the date would be in the past", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(parseStartsAt("Sat, 19 Sep • 06:00 PM", now)).toBe("2026-09-19T12:30:00.000Z");
});

test("parses a dashed date that already carries its own year", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(parseStartsAt("Fri, 02 Oct, 2026 - 06:30 PM", now)).toBe("2026-10-02T13:00:00.000Z");
});

test("rolls a year-less date into next year once it would otherwise be in the past", () => {
  const now = new Date("2026-12-30T12:00:00Z");
  expect(parseStartsAt("Fri, 02 Jan • 06:30 PM", now)).toBe("2027-01-02T13:00:00.000Z");
});

test("parses price text, keeping 'unknown' distinct from 'free'", () => {
  expect(parsePrice("Free")).toEqual({ priceMin: 0, isFree: true });
  expect(parsePrice("INR 499")).toEqual({ priceMin: 499, isFree: false });
  expect(parsePrice("INR 1.0k")).toEqual({ priceMin: 1000, isFree: false });
  expect(parsePrice(null)).toEqual({ priceMin: null, isFree: false });
});

function rawEvent(overrides: Partial<AllEventsRawEvent> = {}): AllEventsRawEvent {
  return {
    id: "1",
    title: "Test Event",
    sourceUrl: "https://allevents.in/hyderabad/test/1",
    venueName: "Lamakaan",
    address: "Banjara Hills, Hyderabad",
    latitude: 17.4,
    longitude: 78.4,
    startsAtText: "Sat, 19 Sep • 06:00 PM",
    priceText: "Free",
    ...overrides,
  };
}

test("holds an event with no venue and no address as online-only", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(toOccurrence(rawEvent({ venueName: null, address: null }), now)).toBeNull();
});

test("holds an event whose title matches a known spam pattern", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(toOccurrence(rawEvent({ title: "Free Astrology Reading" }), now)).toBeNull();
});

test("holds an event more than 400 days out", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(toOccurrence(rawEvent({ startsAtText: "Fri, 02 Oct, 2028 - 06:30 PM" }), now)).toBeNull();
});

test("drops every listing for a title flooding more than 12 distinct venues", () => {
  const flooded = Array.from({ length: 13 }, (_, i) => rawEvent({ id: `${i}`, title: "Free Movie Night", venueName: `Venue ${i}` }));
  const clean = [rawEvent({ id: "clean", title: "Open Mic" })];
  const survivors = dropVenueFloodedTitles([...flooded, ...clean]);
  expect(survivors).toEqual(clean);
});

test("allEvents rejects non-http source URLs at normalization", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "//example.test/event",
    "/event",
    "https://",
    "http:/example.test/event",
  ]) {
    expect(toOccurrence(rawEvent({ sourceUrl }), now)).toEqual(null);
  }
  expect(toOccurrence(rawEvent({ sourceUrl: "http://example.test/event" }), now)).not.toEqual(null);
});
