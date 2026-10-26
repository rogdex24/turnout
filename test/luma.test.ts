import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  isHyderabadEvent,
  type LumaRawEvent,
  parseDiscoverEntry,
  parseDiscoverPage,
  parseTicketPrice,
  toOccurrence,
} from "../src/ingestion/sources/luma.js";
import { runSync } from "../src/ingestion/sync.js";
import { memoryDb } from "./helpers.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");
const page = JSON.parse(fs.readFileSync(path.join(fixturesDir, "luma-geo-page.json"), "utf8"));

test("parses Luma geo discover page into raw Hyd events", () => {
  const { events, hasMore } = parseDiscoverPage(page);
  expect(events.length).toBe(3);
  expect(hasMore).toBe(false);
  const shell = events.find((event) => event.id === "evt-vTk0e897DkgiyBR");
  expect(shell?.title).toContain("Shell E4");
  expect(shell?.sourceUrl).toBe("https://luma.com/jv4nmryc");
  expect(shell?.city).toBe("Hyderabad");
  expect(shell?.venueName).toBe("T-Hub");
  expect(shell?.isFree).toBe(true);
  expect(shell?.startsAt).toBe("2026-09-08T08:30:00.000Z");
});

test("parseDiscoverEntry maps ticket_info.is_free", () => {
  const entry = JSON.parse(fs.readFileSync(path.join(fixturesDir, "luma-entry-sample.json"), "utf8"));
  const raw = parseDiscoverEntry(entry);
  expect(raw?.id).toBe("evt-vTk0e897DkgiyBR");
  expect(parseTicketPrice(entry.ticket_info)).toEqual({ priceMin: 0, isFree: true });
});

function raw(overrides: Partial<LumaRawEvent> = {}): LumaRawEvent {
  return {
    id: "evt-testHyd1",
    slug: "hyd-meetup",
    title: "Hyd Tech Meetup",
    sourceUrl: "https://luma.com/hyd-meetup",
    description: null,
    startsAt: "2026-09-20T13:30:00.000Z",
    endsAt: "2026-09-20T15:30:00.000Z",
    timezone: "Asia/Kolkata",
    venueName: "T-Hub",
    address: "Madhapur, Hyderabad, Telangana",
    city: "Hyderabad",
    latitude: 17.43,
    longitude: 78.37,
    priceMin: 0,
    isFree: true,
    locationType: "offline",
    calendarName: "Hyd Builders",
    ...overrides,
  };
}

test("holds non-Hyderabad leftovers and events without a start time", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(
    toOccurrence(
      raw({
        id: "evt-bom",
        city: "Mumbai",
        address: "BKC, Mumbai",
        venueName: "WeWork",
        title: "Mumbai AI Night",
      }),
      now,
    ),
  ).toBeNull();
  expect(isHyderabadEvent(raw({ city: "Mumbai", address: "Mumbai", venueName: "BKC", title: "AI" }))).toBe(false);
  expect(toOccurrence(raw({ startsAt: null }), now)).toBeNull();
});

test("normalises a Luma event into one occurrence keyed by start day", () => {
  const occurrence = toOccurrence(raw(), new Date("2026-09-08T12:00:00Z"));
  expect(occurrence?.sourceEventId).toBe("evt-testHyd1");
  expect(occurrence?.sourceSlotId).toBe("2026-09-20");
  expect(occurrence?.isFree).toBe(true);
  expect(occurrence?.sourceUrl).toBe("https://luma.com/hyd-meetup");
  expect(occurrence?.categories).toEqual(["Hyd Builders"]);
});

test("sync stores Luma rows under source=luma without breaking sibling sources", async () => {
  const db = memoryDb();
  const lumaRaw = raw();
  const result = await runSync({
    db,
    fetchedBySource: {
      luma: [
        {
          id: lumaRaw.id,
          raw: lumaRaw,
          occurrences: [toOccurrence(lumaRaw, new Date("2026-09-08T12:00:00Z"))!],
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
  expect(row.source).toBe("luma");
  expect(row.title).toContain("Hyd Tech Meetup");
  expect(row.sourceUrl).toBe("https://luma.com/hyd-meetup");
  db.close();
});

test("luma rejects non-http source URLs at normalization", () => {
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
