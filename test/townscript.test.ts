import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  isHyderabadEvent,
  normaliseTownscriptTime,
  parseRadarEvent,
  parseRadarPage,
  type TownscriptRawEvent,
  toOccurrence,
} from "../src/ingestion/sources/townscript.js";
import { runSync } from "../src/ingestion/sync.js";
import { memoryDb } from "./helpers.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");
const page = JSON.parse(fs.readFileSync(path.join(fixturesDir, "townscript-radar-page.json"), "utf8"));

test("parses Townscript radar page into raw Hyd events", () => {
  const { events, hasMore, totalCount } = parseRadarPage(page);
  expect(events.length).toBe(3);
  expect(hasMore).toBe(false);
  expect(totalCount).toBe(3);
  const soldier = events.find((event) => event.id === "530184");
  expect(soldier?.title).toContain("Soldierathon");
  expect(soldier?.sourceUrl).toBe("https://www.townscript.com/e/federal-bank-gunners-soldierathon-hyderabad-2026");
  expect(soldier?.city?.toLowerCase()).toContain("hyderabad");
  expect(soldier?.isFree).toBe(false);
  expect(soldier?.priceMin).toBe(299);
  expect(soldier?.startsAt).toBe("2026-09-26T23:30:00.000Z");
});

test("parseRadarEvent maps free paid flags and shortName URL", () => {
  const entry = JSON.parse(fs.readFileSync(path.join(fixturesDir, "townscript-event-sample.json"), "utf8"));
  const raw = parseRadarEvent(entry);
  expect(raw?.id).toBe("502051");
  expect(raw?.shortName).toBe("pink-run-5k-hyderabad");
  expect(raw?.isFree).toBe(true);
  expect(raw?.keywords).toContain("marathons");
  expect(normaliseTownscriptTime("2026-09-26T23:30:00+0000")).toBe("2026-09-26T23:30:00.000Z");
});

function raw(overrides: Partial<TownscriptRawEvent> = {}): TownscriptRawEvent {
  return {
    id: "999001",
    eventId: 999001,
    shortName: "hyd-workshop-test",
    title: "Hyd Design Workshop",
    sourceUrl: "https://www.townscript.com/e/hyd-workshop-test",
    description: "A workshop in Hyderabad",
    startsAt: "2026-09-20T13:30:00.000Z",
    endsAt: "2026-09-20T15:30:00.000Z",
    timezone: "Asia/Calcutta",
    venueName: "T-Hub",
    address: "Gachibowli, Hyderabad",
    city: "Hyderabad",
    locality: "Gachibowli",
    latitude: 17.43,
    longitude: 78.37,
    priceMin: 499,
    isFree: false,
    paid: true,
    onlineEvent: false,
    live: true,
    keywords: ["workshops"],
    organizerName: "Hyd Makers",
    coverImageUrl: null,
    ...overrides,
  };
}

test("holds non-Hyderabad leftovers and events without a start time", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(
    toOccurrence(
      raw({
        id: "888",
        city: "Mumbai",
        locality: "BKC",
        address: "BKC, Mumbai",
        venueName: "WeWork",
        title: "Mumbai AI Night",
        shortName: "mumbai-ai-night",
      }),
      now,
    ),
  ).toBeNull();
  expect(
    isHyderabadEvent(raw({ city: "Mumbai", locality: "BKC", address: "Mumbai", venueName: "BKC", title: "AI", shortName: "ai" })),
  ).toBe(false);
  expect(toOccurrence(raw({ startsAt: null }), now)).toBeNull();
});

test("normalises a Townscript event into one occurrence keyed by start day", () => {
  const occurrence = toOccurrence(raw(), new Date("2026-09-08T12:00:00Z"));
  expect(occurrence?.sourceEventId).toBe("999001");
  expect(occurrence?.sourceSlotId).toBe("2026-09-20");
  expect(occurrence?.isFree).toBe(false);
  expect(occurrence?.priceMin).toBe(499);
  expect(occurrence?.sourceUrl).toBe("https://www.townscript.com/e/hyd-workshop-test");
  expect(occurrence?.categories).toEqual(["workshops"]);
});

test("sync stores Townscript rows under source=townscript without breaking sibling sources", async () => {
  const db = memoryDb();
  const townscriptRaw = raw();
  const result = await runSync({
    db,
    fetchedBySource: {
      townscript: [
        {
          id: townscriptRaw.id,
          raw: townscriptRaw,
          occurrences: [toOccurrence(townscriptRaw, new Date("2026-09-08T12:00:00Z"))!],
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
  expect(row.source).toBe("townscript");
  expect(row.title).toContain("Hyd Design Workshop");
  expect(row.sourceUrl).toBe("https://www.townscript.com/e/hyd-workshop-test");
  db.close();
});

test("townscript rejects non-http source URLs at normalization", () => {
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
