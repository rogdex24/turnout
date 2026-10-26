import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  eventUrl,
  flightPayload,
  type GrowezyRawEvent,
  isHyderabadEvent,
  parsePage,
  resolveTextRef,
  toOccurrences,
} from "../src/ingestion/sources/growezy.js";
import { runSync } from "../src/ingestion/sync.js";
import { memoryDb } from "./helpers.js";

const html = fs.readFileSync(path.join(import.meta.dir, "fixtures", "growezy-organizer-page.html"), "utf8");
const PAGE = "events-by-marvity-";
const NOW = new Date("2026-09-08T00:00:00Z");

const only = (): GrowezyRawEvent => {
  const [event] = parsePage(html, PAGE);
  expect(event).toBeDefined();
  return event!;
};

test("parses an organizer page into raw events", () => {
  const event = only();
  expect(event.title).toBe("Break Rules, Be Free");
  expect(event.urlKey).toBe("awareness-building-workshop");
  expect(event.venueName).toBe("Kaleidoscope Begumpet");
  expect(event.city).toBe("Hyderabad");
  expect(event.isOnline).toBe(false);
});

test("price is converted out of paise", () => {
  expect(only().priceMin).toBe(499);
});

test("the description is resolved from the streamed chunk it is referenced by", () => {
  const description = only().description;
  expect(description).toContain("awareness building workshop");
  expect(description).not.toContain("$");
  expect(description).not.toContain("<p>");
});

test("keeps the real clock time, which the page's JSON-LD does not carry", () => {
  // JSON-LD publishes startDate as 2026-09-19T00:00:00.000Z, a date with no
  // time. The page's own schedule says 15:45 IST, which is 10:15 UTC.
  expect(only().slots).toEqual([{ slotId: "04066bda-2f8d-4e75-83f9-fbc51688afaa", startsAt: "2026-09-19T10:15:00.000Z" }]);
});

test("links to the public event page", () => {
  expect(eventUrl(only())).toBe("https://growezy.club/events-by-marvity-/awareness-building-workshop");
});

test("one occurrence per bookable slot", () => {
  const occurrences = toOccurrences(only(), NOW);
  expect(occurrences).toHaveLength(1);
  expect(occurrences[0]!.startsAt).toBe("2026-09-19T10:15:00.000Z");
  expect(occurrences[0]!.sourceSlotId).toBe("04066bda-2f8d-4e75-83f9-fbc51688afaa");
  expect(occurrences[0]!.isFree).toBe(false);
});

test("a multi-date event explodes into one occurrence per date and time", () => {
  const raw: GrowezyRawEvent = {
    ...only(),
    slots: [
      { slotId: "a", startsAt: "2026-09-19T10:15:00.000Z" },
      { slotId: "b", startsAt: "2026-09-26T10:15:00.000Z" },
      { slotId: "c", startsAt: "2026-09-26T13:15:00.000Z" },
    ],
  };
  expect(toOccurrences(raw, NOW).map((o) => o.sourceSlotId)).toEqual(["a", "b", "c"]);
});

test("drops events that are online or outside Hyderabad", () => {
  const base = only();
  expect(isHyderabadEvent(base)).toBe(true);
  expect(isHyderabadEvent({ ...base, isOnline: true })).toBe(false);
  expect(isHyderabadEvent({ ...base, city: "Pune", venueName: "Koregaon Park", address: "Pune 411001" })).toBe(false);
  expect(toOccurrences({ ...base, isOnline: true }, NOW)).toEqual([]);
});

test("drops slots too far out or already past", () => {
  const base = only();
  expect(toOccurrences({ ...base, slots: [{ slotId: "old", startsAt: "2026-01-01T10:00:00Z" }] }, NOW)).toEqual([]);
  expect(toOccurrences({ ...base, slots: [{ slotId: "far", startsAt: "2030-01-01T10:00:00Z" }] }, NOW)).toEqual([]);
});

test("a page whose payload is missing or reshaped yields nothing rather than throwing", () => {
  expect(parsePage("<html><body>no flight data</body></html>", PAGE)).toEqual([]);
  expect(parsePage('<script>self.__next_f.push([1,"{\\"displayItems\\":[{\\"type\\":\\"other\\"}]}"])</script>', PAGE)).toEqual([]);
  expect(flightPayload("<html></html>")).toBe("");
});

test("an unresolvable text reference degrades to no description", () => {
  expect(resolveTextRef("", "$99")).toBeNull();
  expect(resolveTextRef("", "plain text")).toBe("plain text");
  expect(resolveTextRef("\n7:T3,abc", "$7")).toBe("abc");
});

test("syncs end to end into the database", async () => {
  const db = memoryDb();
  const raw = only();
  await runSync({
    db,
    now: () => NOW,
    fetchedBySource: { growezy: [{ id: raw.id, raw, occurrences: toOccurrences(raw, NOW) }] },
  });

  const row = db.prepare("SELECT title, venue_name, source_url, starts_at FROM event WHERE source = 'growezy'").get() as {
    title: string;
    venue_name: string;
    source_url: string;
    starts_at: string;
  };
  expect(row.title).toBe("Break Rules, Be Free");
  expect(row.venue_name).toBe("Kaleidoscope Begumpet");
  expect(row.source_url).toBe("https://growezy.club/events-by-marvity-/awareness-building-workshop");
  expect(row.starts_at).toBe("2026-09-19T10:15:00.000Z");
  db.close();
});
