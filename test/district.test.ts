import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type DistrictRawEvent,
  fetchAllEvents,
  hyderabadSitemapUrls,
  parseEventDetailPage,
  parseListingPage,
  parseSitemapEventUrls,
  toOccurrence,
} from "../src/ingestion/sources/district.js";
import { runSync } from "../src/ingestion/sync.js";
import type { FetchLike } from "../src/utils/http.js";
import { memoryDb } from "./helpers.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");
const listingHtml = fs.readFileSync(path.join(fixturesDir, "district-upcoming-hyderabad.html"), "utf8");
const detailHtml = fs.readFileSync(path.join(fixturesDir, "district-event-detail.html"), "utf8");
const sitemapXml = fs.readFileSync(path.join(fixturesDir, "district-event-detail-pages-snippet.xml"), "utf8");

test("parses District city ItemList JSON-LD into raw events", () => {
  const events = parseListingPage(listingHtml);
  expect(events.length).toBeGreaterThan(5);
  const otherSide = events.find((event) => event.id.includes("cera-khin"));
  expect(otherSide?.venueName).toContain("Nanakramguda");
  expect(otherSide?.startsAt).toBe("2026-09-12T14:30:00.000Z");
  expect(otherSide?.priceMin).toBe(1000);
});

test("parses a District event detail Event JSON-LD", () => {
  const event = parseEventDetailPage(detailHtml);
  expect(event?.id).toBe("ruhbaru-orchestral-qawwali-project-hyderabad-2026-buy-tickets");
  expect(event?.startsAt).toBe("2026-12-12T14:00:00.000Z");
  expect(event?.priceMin).toBe(2099);
});

test("sitemap parsing keeps only Hyderabad event URLs", () => {
  const urls = parseSitemapEventUrls(sitemapXml);
  expect(urls.length).toBe(3);
  expect(hyderabadSitemapUrls(urls)).toEqual([
    "https://www.district.in/events/ruhbaru-orchestral-qawwali-project-hyderabad-2026-buy-tickets",
    "https://www.district.in/events/gold-foil-art-date-hyderabad-aug1-2026-buy-tickets",
  ]);
});

function raw(overrides: Partial<DistrictRawEvent> = {}): DistrictRawEvent {
  return {
    id: "clay-sculpting-hyderabad-aug1-2026-buy-tickets",
    title: "Clay Sculpting Hyderabad",
    sourceUrl: "https://www.district.in/events/clay-sculpting-hyderabad-aug1-2026-buy-tickets",
    description: "Hands-on clay workshop",
    startsAt: "2026-09-20T13:30:00.000Z",
    endsAt: "2026-09-20T15:30:00.000Z",
    venueName: "Red Rhino, Hyderabad",
    address: "Hyderabad, IN",
    latitude: 17.4,
    longitude: 78.4,
    priceMin: 999,
    imageUrl: null,
    ...overrides,
  };
}

test("holds non-Hyderabad leftovers and events without a start time", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(
    toOccurrence(
      raw({
        id: "fifa-india-vs-brazil-buy-tickets",
        sourceUrl: "https://www.district.in/events/fifa-international-friendly-india-vs-brazil-buy-tickets",
        venueName: "Vivekananda Yuba Bharati Krirangan (VYBK)",
        address: "Kolkata, IN",
      }),
      now,
    ),
  ).toBeNull();
  expect(toOccurrence(raw({ startsAt: null }), now)).toBeNull();
});

test("normalises a District event into one occurrence keyed by start day", () => {
  const occurrence = toOccurrence(raw(), new Date("2026-09-08T12:00:00Z"));
  expect(occurrence?.sourceSlotId).toBe("2026-09-20");
  expect(occurrence?.isFree).toBe(false);
  expect(occurrence?.priceMin).toBe(999);
});

test("sync stores District rows under source=district without breaking Communitie", async () => {
  const db = memoryDb();
  const districtRaw = raw();
  const result = await runSync({
    db,
    fetchedBySource: {
      district: [
        {
          id: districtRaw.id,
          raw: districtRaw,
          occurrences: [toOccurrence(districtRaw, new Date("2026-09-08T12:00:00Z"))!],
        },
      ],
    },
  });
  expect(result.created).toBe(1);
  expect(result.sourceErrors).toEqual({});
  const row = db.prepare("SELECT source, title FROM event WHERE status = 'active'").get() as {
    source: string;
    title: string;
  };
  expect(row.source).toBe("district");
  expect(row.title).toContain("Clay Sculpting");
  db.close();
});

test("a failing source does not fail the whole sync or delist a sibling source", async () => {
  const db = memoryDb();
  const districtRaw = raw();
  await runSync({
    db,
    fetchedBySource: {
      district: [
        {
          id: districtRaw.id,
          raw: districtRaw,
          occurrences: [toOccurrence(districtRaw, new Date("2026-09-08T12:00:00Z"))!],
        },
      ],
    },
  });

  const failingFetch: FetchLike = async () => {
    throw new Error("boom");
  };

  // Second run: only Communitie is asked to fetch and it fails; District must stay active untouched.
  const second = await runSync({
    db,
    sources: ["communitie"],
    fetchImpl: failingFetch,
    sleepMs: 0,
  });
  expect(second.sourceErrors.communitie).toMatch(/boom/);
  expect(second.delisted).toBe(0);
  const still = db.prepare("SELECT status, missed_runs AS missed FROM event WHERE source = 'district'").get() as {
    status: string;
    missed: number;
  };
  expect(still.status).toBe("active");
  expect(still.missed).toBe(0);
  db.close();
});

test("a District cover is kept only when it is an absolute https URL", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  expect(toOccurrence(raw({ imageUrl: "https://cdn.example/p.jpg" }), now)?.imageUrl).toBe("https://cdn.example/p.jpg");
  expect(toOccurrence(raw({ imageUrl: "http://cdn.example/p.jpg" }), now)?.imageUrl).toBeNull();
});

test("incomplete District details cannot authorize delisting at the health threshold", async () => {
  const db = memoryDb();
  const now = new Date("2026-09-08T12:00:00Z");
  const records = ["a", "b", "c", "d"].map((id) =>
    raw({
      id: `${id}-hyderabad`,
      sourceUrl: `https://www.district.in/events/${id}-hyderabad`,
    }),
  );
  await runSync({
    db,
    fetchedBySource: {
      district: records.map((record) => ({
        id: record.id,
        raw: record,
        occurrences: [toOccurrence(record, now)!],
      })),
    },
  });
  const listing = `<script type="application/ld+json">${JSON.stringify({
    "@type": "ItemList",
    itemListElement: records.slice(0, 2).map((record) => ({
      item: {
        "@type": "Event",
        name: record.title,
        url: record.sourceUrl,
        startDate: record.startsAt,
        location: { name: record.venueName },
      },
    })),
  })}</script>`;
  const fetchImpl: FetchLike = async (url) => {
    if (String(url).includes("sitemap"))
      return new Response(`<urlset>${records.map((record) => `<url><loc>${record.sourceUrl}</loc></url>`).join("")}</urlset>`);
    if (String(url).includes("upcoming-events-in-hyderabad") || String(url).includes("events-this-weekend-in-hyderabad"))
      return new Response(listing);
    return new Response("unavailable", { status: 503 });
  };
  for (let i = 0; i < 2; i++) {
    const result = await runSync({ db, sources: ["district"], fetchImpl, sleepMs: 0, now: () => now });
    expect(result.sourceErrors.district).toContain("503");
    expect(result.delisted).toBe(0);
  }
  expect(db.query("SELECT COUNT(*) AS n FROM event WHERE status = 'active' AND missed_runs = 0").get()).toEqual({ n: 4 });
  db.close();
});

test("district rejects non-http source URLs at normalization", () => {
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

test("District rejects invalid required detail dates and capped crawls", async () => {
  const record = raw({ startsAt: "not-a-date" });
  const detail = `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: record.title, url: record.sourceUrl, startDate: record.startsAt })}</script>`;
  const fetchImpl: FetchLike = async (url) => {
    if (String(url).includes("sitemap")) return new Response(`<urlset><url><loc>${record.sourceUrl}</loc></url></urlset>`);
    if (String(url) === record.sourceUrl) return new Response(detail);
    return new Response("");
  };
  await expect(fetchAllEvents({ fetchImpl, sleepMs: 0, fetchDetails: true })).rejects.toThrow("start date");
  await expect(fetchAllEvents({ fetchImpl, sleepMs: 0, fetchDetails: true, maxDetailFetches: 0 })).rejects.toThrow("limit");
});
