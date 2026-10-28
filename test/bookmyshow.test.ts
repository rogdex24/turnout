import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type BookMyShowRawEvent,
  isHyderabadEvent,
  isWorkshopFlood,
  MAX_DAYS_FROM_NOW,
  parseLengthMinutes,
  parseQuickbookEvent,
  parseQuickbookPayload,
  parseShowDateCode,
  showDateToUtcIso,
  toOccurrences,
} from "../src/ingestion/sources/bookmyshow.js";
import { runSync } from "../src/ingestion/sync.js";
import { migrate } from "../src/migrate.js";
import { siteResponse } from "../src/web/index.js";
import { memoryDb } from "./helpers.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");
const page = JSON.parse(fs.readFileSync(path.join(fixturesDir, "bookmyshow-quickbook-ct.json"), "utf8"));

test("parses QUICKBOOK CT/PL/SP payload into raw events (no movies)", () => {
  const events = parseQuickbookPayload(page);
  expect(events.length).toBeGreaterThanOrEqual(3);
  expect(events.every((e) => e.eventType !== "MT")).toBe(true);
  expect(events[0]!.eventCode).toMatch(/^ET/);
  expect(events[0]!.venues.length).toBeGreaterThan(0);
  expect(events[0]!.dates.length).toBeGreaterThan(0);
});

test("showDateToUtcIso anchors YYYYMMDD at IST midnight without claiming a clock time", () => {
  expect(parseShowDateCode("20260908")).toEqual({ y: 2026, m: 9, d: 8 });
  expect(showDateToUtcIso("20260908")).toBe("2026-09-07T18:30:00.000Z");
  expect(parseLengthMinutes("1 hr 30 mins")).toBe(90);
  expect(parseLengthMinutes("2 hrs ")).toBe(120);
});

test("skips MT movie payloads even if present", () => {
  const movie = parseQuickbookEvent({
    EventCode: "ET999",
    EventTitle: "Some Movie",
    EventType: "MT",
    MinPrice: "250.00",
    FShareURL: "https://in.bookmyshow.com/movies/foo/ET999",
    arrDates: [{ ShowDateCode: "20260910" }],
    arrVenues: [{ VenueCode: "PVR", VenueName: "PVR Hyd", RegionCode: "HYD", SubRegionCode: "HYD" }],
  });
  expect(movie).toBeNull();
});

function raw(overrides: Partial<BookMyShowRawEvent> = {}): BookMyShowRawEvent {
  return {
    id: "ET00414970",
    eventCode: "ET00414970",
    eventType: "CT",
    title: "Telugu Standup @Hyderabad",
    sourceUrl: "https://in.bookmyshow.com/events/telugu-standup-kukatpally/ET00414970",
    genre: "Comedy Shows",
    genres: ["Comedy Shows"],
    language: "Telugu",
    length: "1 hr 30 mins",
    minPrice: 0,
    isFree: true,
    soldOut: false,
    isGlobal: false,
    bannerUrl: null,
    dates: [
      { showDateCode: "20260908", showEndDateCode: "20260908", showDateDisplay: "Today, 8 Sep" },
      { showDateCode: "20260909", showEndDateCode: "20260909", showDateDisplay: "Tomorrow, 9 Sep" },
    ],
    venues: [
      {
        venueCode: "TSDM",
        venueName: "The Street Comedy Club: Hyderabad",
        address: "Madhapur, Hyderabad",
        latitude: 17.45,
        longitude: 78.38,
        regionCode: "HYD",
        subRegionCode: "HYD",
      },
    ],
    ...overrides,
  };
}

test("holds non-Hyderabad venues and emits one occurrence per date", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(
    toOccurrences(
      raw({
        venues: [
          {
            venueCode: "BOM",
            venueName: "NCPA Mumbai",
            address: "Nariman Point",
            latitude: 19.0,
            longitude: 72.8,
            regionCode: "MUMBAI",
            subRegionCode: "MUMBAI",
          },
        ],
      }),
      now,
    ),
  ).toEqual([]);
  expect(isHyderabadEvent(raw())).toBe(true);

  const occ = toOccurrences(raw(), now);
  expect(occ.length).toBe(2);
  expect(occ[0]!.sourceEventId).toBe("ET00414970");
  expect(occ[0]!.sourceSlotId).toBe("20260908-TSDM");
  expect(occ[0]!.startsAt).toBe("2026-09-07T18:30:00.000Z");
  expect(occ[0]!.endsAt).toBeNull();
  expect(occ[0]!.isFree).toBe(true);
  expect(occ[0]!.venueName).toContain("Hyderabad");
});

test("sync stores BookMyShow rows under source=bookmyshow", async () => {
  const db = memoryDb();
  const events = parseQuickbookPayload(page);
  const items = events.map((r) => ({
    id: r.id,
    raw: r,
    occurrences: toOccurrences(r, new Date("2026-09-08T12:00:00Z")),
  }));
  const result = await runSync({
    db,
    fetchedBySource: { bookmyshow: items },
    now: () => new Date("2026-09-08T12:00:00Z"),
  });
  expect(result.created).toBeGreaterThan(0);
  const count = db.prepare("SELECT COUNT(*) AS c FROM event WHERE source = 'bookmyshow' AND status = 'active'").get() as { c: number };
  expect(count.c).toBeGreaterThan(0);
  const row = db.prepare("SELECT title, source_url FROM event WHERE source = 'bookmyshow' LIMIT 1").get() as {
    title: string;
    source_url: string;
  };
  expect(row.source_url).toContain("bookmyshow.com");
  expect(row.title.length).toBeGreaterThan(0);
});

test("drops Workshops genre flood entirely", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const workshop = raw({
    genre: "Workshops",
    genres: ["Workshops"],
    title: "Daily Coding Bootcamp",
    dates: [
      { showDateCode: "20260908", showEndDateCode: "20260908", showDateDisplay: null },
      { showDateCode: "20260909", showEndDateCode: "20260909", showDateDisplay: null },
      { showDateCode: "20260910", showEndDateCode: "20260910", showDateDisplay: null },
    ],
  });
  expect(isWorkshopFlood(workshop)).toBe(true);
  expect(toOccurrences(workshop, now)).toEqual([]);
});

test("caps date expansion to MAX_DAYS_FROM_NOW and keeps non-workshop CT events", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(MAX_DAYS_FROM_NOW).toBeLessThanOrEqual(60);
  const far = raw({
    genre: "Comedy Shows",
    genres: ["Comedy Shows"],
    dates: [
      { showDateCode: "20260910", showEndDateCode: "20260910", showDateDisplay: null },
      { showDateCode: "20261201", showEndDateCode: "20261201", showDateDisplay: null },
    ],
  });
  expect(isWorkshopFlood(far)).toBe(false);
  const occ = toOccurrences(far, now);
  expect(occ.length).toBe(1);
  expect(occ[0]!.startsAt).toBe("2026-09-09T18:30:00.000Z");
});

test("BookMyShow date-only records expose dates without invented times on every public surface", async () => {
  const db = memoryDb();
  const now = () => new Date("2026-09-08T12:00:00Z");
  const record = raw();
  const occurrences = toOccurrences(record, now());
  expect(occurrences[0]).toMatchObject({ timeKind: "date-only", endsAt: null });
  await runSync({ db, fetchedBySource: { bookmyshow: [{ id: record.id, raw: record, occurrences }] } });
  const list = (await siteResponse(db, new Request("http://localhost/api/events"), now).json()) as { events: Array<{ url: string }> };
  expect(list.events).toHaveLength(2);
  const item = list.events[0]!;
  expect(item).toMatchObject({ is_all_day: true, starts_at: null, starts_at_local: "2026-09-08", ends_at: null });
  const detail = await siteResponse(db, new Request(item.url), now).text();
  expect(detail).not.toMatch(/7:00|19:00|12:00|00:00/);
  expect(detail).toContain('"startDate":"2026-09-08"');
  const listing = await siteResponse(db, new Request("http://localhost/"), now).text();
  expect(listing).not.toMatch(/7:00|19:00|12:00|00:00/);
  const ics = await siteResponse(db, new Request(`${item.url}.ics`), now).text();
  expect(ics).toContain("DTSTART;VALUE=DATE:20260908");
  expect(ics).toContain("DTEND;VALUE=DATE:20260909");
  expect(ics).not.toContain("DTSTART;TZID");
  db.close();
});

test("date-only migration upgrades the old event schema and clears invented BookMyShow times", async () => {
  const db = memoryDb();
  const record = raw();
  await runSync({
    db,
    fetchedBySource: { bookmyshow: [{ id: record.id, raw: record, occurrences: toOccurrences(record, new Date("2026-09-08T12:00:00Z")) }] },
  });
  db.exec("UPDATE event SET starts_at = '2026-09-08T13:30:00.000Z', ends_at = '2026-09-08T15:00:00.000Z'");
  db.exec("DROP VIEW eligible_show; DROP VIEW listable_event; ALTER TABLE event DROP COLUMN time_kind");
  migrate(db);
  migrate(db);
  expect(db.query("SELECT time_kind, starts_at, ends_at FROM event LIMIT 1").get()).toEqual({
    time_kind: "date-only",
    starts_at: "2026-09-07T18:30:00.000Z",
    ends_at: null,
  });
  db.close();
});

test("bookmyshow rejects non-http source URLs at normalization", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "//example.test/event",
    "/event",
    "https://",
    "http:/example.test/event",
  ]) {
    expect(toOccurrences(raw({ sourceUrl }), now)).toEqual([]);
  }
  expect(toOccurrences(raw({ sourceUrl: "http://example.test/event" }), now)).not.toEqual([]);
});

test("date-only migration releases legacy groups formed against invented times", async () => {
  const db = memoryDb();
  const record = raw();
  await runSync({
    db,
    fetchedBySource: { bookmyshow: [{ id: record.id, raw: record, occurrences: toOccurrences(record, new Date("2026-09-08T12:00:00Z")) }] },
  });
  const timed = toOccurrences(record, new Date("2026-09-08T12:00:00Z"))[0]!;
  await runSync({
    db,
    fetchedBySource: {
      luma: [
        {
          id: "timed",
          raw: {},
          occurrences: [{ ...timed, timeKind: "timed", sourceEventId: "timed", startsAt: "2026-09-08T13:30:00.000Z" }],
        },
      ],
    },
  });
  db.exec("UPDATE event SET dedupe_group_id = 'legacy', is_canonical = CASE WHEN source = 'bookmyshow' THEN 1 ELSE 0 END");
  db.exec("UPDATE event SET starts_at = '2026-09-08T13:30:00.000Z' WHERE source = 'bookmyshow'");
  db.exec("DROP VIEW eligible_show; DROP VIEW listable_event; ALTER TABLE event DROP COLUMN time_kind");
  migrate(db);
  expect(db.query("SELECT COUNT(*) AS n FROM event WHERE is_canonical = 1 AND dedupe_group_id IS NULL").get()).toEqual({ n: 3 });
  db.close();
});

test("a BookMyShow banner is kept only when it is an absolute https URL", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(toOccurrences(raw({ bannerUrl: "https://assets.example/b.jpg" }), now)[0]?.imageUrl).toBe("https://assets.example/b.jpg");
  expect(toOccurrences(raw({ bannerUrl: "javascript:alert(1)" }), now)[0]?.imageUrl).toBeNull();
});
