import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  eventUrlFromSlug,
  isHyderabadEvent,
  type MeraEventsRawEvent,
  normaliseIsoTime,
  parseApiEvent,
  parseEventsPage,
  stripHtml,
  toOccurrence,
} from "../src/ingestion/sources/meraEvents.js";
import { runSync } from "../src/ingestion/sync.js";
import { memoryDb } from "./helpers.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");
const page = JSON.parse(fs.readFileSync(path.join(fixturesDir, "meraevents-page.json"), "utf8"));

test("parses MeraEvents listing page into raw Hyd events", () => {
  const { events, hasMore, totalCount } = parseEventsPage(page);
  expect(events.length).toBeGreaterThanOrEqual(2);
  expect(hasMore).toBe(false);
  expect(totalCount).toBe(events.length);
  const first = events[0]!;
  expect(first.sourceUrl).toBe(eventUrlFromSlug(first.urlSlug));
  expect(first.startsAt).toMatch(/Z$/);
});

test("parseApiEvent maps price, venue, and slug URL", () => {
  const entry = JSON.parse(fs.readFileSync(path.join(fixturesDir, "meraevents-event-sample.json"), "utf8"));
  const raw = parseApiEvent(entry);
  expect(raw?.id).toBe(String(entry.id));
  expect(raw?.venueName).toBeTruthy();
  expect(raw?.sourceUrl).toContain("meraevents.com/events/");
  expect(stripHtml("<p>Hello&nbsp;<strong>world</strong></p>")).toBe("Hello world");
  expect(normaliseIsoTime("2026-09-12T05:30:00.000Z")).toBe("2026-09-12T05:30:00.000Z");
});

function raw(overrides: Partial<MeraEventsRawEvent> = {}): MeraEventsRawEvent {
  return {
    id: "300411",
    eventId: 300411,
    urlSlug: "co-founder-circle",
    title: "Co-Founder Circle 2nd Edition",
    sourceUrl: "https://meraevents.com/events/co-founder-circle",
    description: "A meetup in Hyderabad",
    startsAt: "2026-09-12T05:30:00.000Z",
    endsAt: "2026-09-12T07:30:00.000Z",
    timezone: "Asia/Kolkata",
    venueName: "NanoSpace Coworking Nanakramguda Branch",
    address: "VIJAYA KRISNA TOWERS",
    cityName: "Hyderabad",
    latitude: 17.42,
    longitude: 78.34,
    priceMin: 199,
    isFree: false,
    eventMode: "offline",
    status: "active",
    privateEvent: false,
    deleted: false,
    isPast: false,
    coverImageUrl: null,
    tags: ["networking"],
    ...overrides,
  };
}

test("holds non-Hyderabad leftovers, online-only, and events without a start time", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(
    toOccurrence(
      raw({
        id: "1",
        cityName: "Mumbai",
        venueName: "WeWork BKC",
        address: "BKC",
        title: "Mumbai AI Night",
        urlSlug: "mumbai-ai-night",
        eventMode: "offline",
      }),
      now,
    ),
  ).toBeNull();
  expect(toOccurrence(raw({ eventMode: "online", venueName: null, cityName: null, title: "Webinar", urlSlug: "webinar" }), now)).toBeNull();
  expect(toOccurrence(raw({ startsAt: null }), now)).toBeNull();
  expect(isHyderabadEvent(raw({ cityName: null, venueName: "Gachibowli Stadium", title: "Run", urlSlug: "run" }))).toBe(true);
});

test("normalises a MeraEvents event into one occurrence keyed by start day", () => {
  const occurrence = toOccurrence(raw(), new Date("2026-09-08T12:00:00Z"));
  expect(occurrence?.sourceEventId).toBe("300411");
  expect(occurrence?.sourceSlotId).toBe("2026-09-12");
  expect(occurrence?.isFree).toBe(false);
  expect(occurrence?.priceMin).toBe(199);
  expect(occurrence?.sourceUrl).toBe("https://meraevents.com/events/co-founder-circle");
  expect(occurrence?.categories).toEqual(["networking"]);
});

test("sync stores MeraEvents rows under source=meraevents without breaking sibling sources", async () => {
  const db = memoryDb();
  const meraRaw = raw();
  const result = await runSync({
    db,
    fetchedBySource: {
      meraevents: [
        {
          id: meraRaw.id,
          raw: meraRaw,
          occurrences: [toOccurrence(meraRaw, new Date("2026-09-08T12:00:00Z"))!],
        },
      ],
    },
  });
  expect(result.created).toBe(1);
  expect(result.sourceErrors).toEqual({});
  const row = db.prepare("SELECT source, title, source_url AS sourceUrl FROM event WHERE status = 'active'").get() as {
    source: string;
    title: string;
    sourceUrl: string;
  };
  expect(row.source).toBe("meraevents");
  expect(row.title).toContain("Co-Founder Circle");
  expect(row.sourceUrl).toBe("https://meraevents.com/events/co-founder-circle");
  db.close();
});

test("a MeraEvents cover is kept only when it is an absolute https URL", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(toOccurrence(raw({ coverImageUrl: "https://cdn.example/c.jpg" }), now)?.imageUrl).toBe("https://cdn.example/c.jpg");
  expect(toOccurrence(raw({ coverImageUrl: "/relative.jpg" }), now)?.imageUrl).toBeNull();
});

test("meraEvents rejects non-http source URLs at normalization", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "//example.test/event",
    "/event",
    "https://",
    "http:/example.test/event",
  ]) {
    expect(toOccurrence(raw({ sourceUrl }), now)).toEqual(null);
  }
  expect(toOccurrence(raw({ sourceUrl: "http://example.test/event" }), now)).not.toEqual(null);
});
