import { expect, test } from "bun:test";
import { AREA_CENTRES } from "../src/catalog/area.js";
import type { RawEvent } from "../src/ingestion/sources/communitie.js";
import { runSync } from "../src/ingestion/sync.js";
import { siteResponse } from "../src/web/index.js";
import { collapseRuns } from "../src/web/queries.js";
import { communitieItems, memoryDb } from "./helpers.js";

function event(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: "event-1",
    slug: "comedy-in-gachibowli",
    title: "Comedy in Gachibowli",
    status: "LIVE",
    approvalStatus: "APPROVED",
    categories: [{ slug: "comedy" }],
    minimumBasePrice: 0,
    timeSlots: [
      {
        venueName: "Gachibowli Arena",
        address: "Gachibowli, Hyderabad",
        scheduleSlots: [{ id: "slot-1", slotDate: "2026-09-12", startTime: "19:00:00" }],
      },
    ],
    ...overrides,
  };
}

const NOW = () => new Date("2026-09-08T12:00:00Z");

/** A one-occurrence item for a source that is not Communitie. */
function fetchedItem(id: string, overrides: Partial<{ title: string; categories: string[] }> = {}) {
  return {
    id,
    raw: { id },
    occurrences: [
      {
        sourceEventId: id,
        sourceSlotId: "s1",
        slug: id,
        title: overrides.title ?? `Event ${id}`,
        description: null,
        timeKind: "timed" as const,
        startsAt: "2026-09-12T13:30:00.000Z",
        endsAt: null,
        venueName: "Phoenix Arena",
        address: "Gachibowli, Hyderabad",
        latitude: null,
        longitude: null,
        categories: overrides.categories ?? [],
        tags: [],
        priceMin: null,
        isFree: true,
        sourceUrl: `https://example.test/${id}`,
      },
    ],
  };
}

async function responseFor(path: string): Promise<Response> {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const response = siteResponse(db, new Request(`http://localhost${path}`), () => new Date("2026-09-08T12:00:00Z"));
  db.close();
  return response;
}

test("the listing shows the next seven days and keeps filters in its links", async () => {
  const response = await responseFor("/?area=gachibowli&category=comedy&free=true");
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain("Comedy in Gachibowli");
  expect(body).toContain('action="/"');
  expect(body).toContain('value="gachibowli"');
  expect(body).toContain('value="comedy"');
  expect(body).toContain('name="free"');
  expect(body).toContain("takedown@hydsocial.in");
});

test("the detail page links out to the source", async () => {
  const response = await responseFor("/e/comedy-in-gachibowli");
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain("Comedy in Gachibowli");
  expect(body).toContain("View source");
  expect(body).toContain("https://events.communitie.in/events/comedy-in-gachibowli");
});

test("unknown event routes return 404", async () => {
  const response = await responseFor("/e/not-found");
  expect(response.status).toBe(404);
});

test("listing prefers canonical rows and hides fuzzy-dedupe losers", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      district: [
        {
          id: "d1",
          raw: { id: "d1" },
          occurrences: [
            {
              sourceEventId: "d1",
              sourceSlotId: "0",
              slug: "same-show-district",
              title: "Same Show Night",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T13:30:00.000Z",
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: null,
              longitude: null,
              categories: ["comedy"],
              tags: [],
              priceMin: 499,
              isFree: false,
              sourceUrl: "https://district.example/d1",
            },
          ],
        },
      ],
      allevents: [
        {
          id: "a1",
          raw: { id: "a1" },
          occurrences: [
            {
              sourceEventId: "a1",
              sourceSlotId: "0",
              slug: "same-show-allevents",
              title: "Same Show Night",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T13:30:00.000Z",
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: null,
              longitude: null,
              categories: ["comedy"],
              tags: [],
              priceMin: 499,
              isFree: false,
              sourceUrl: "https://allevents.example/a1",
            },
          ],
        },
      ],
    },
  });

  const listing = siteResponse(db, new Request("http://localhost/"), () => new Date("2026-09-08T12:00:00Z"));
  const body = await listing.text();
  expect(listing.status).toBe(200);
  // Title appears once (one card), not twice for the fuzzy pair
  expect(body.split("Same Show Night").length - 1).toBe(1);

  const loser = db.prepare("SELECT slug FROM event WHERE is_canonical = 0").get() as { slug: string };
  expect(loser?.slug).toBeTruthy();
  const detail = siteResponse(db, new Request(`http://localhost/e/${loser.slug}`));
  expect(detail.status).toBe(404);
  db.close();
});

test("listing and detail hold empty-venue rows (SPEC: no TBD venues)", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      townscript: [
        {
          id: "with-venue",
          raw: { id: "with-venue" },
          occurrences: [
            {
              sourceEventId: "with-venue",
              sourceSlotId: "0",
              slug: "named-venue-show",
              title: "Named Venue Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T13:30:00.000Z",
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: null,
              longitude: null,
              categories: ["comedy"],
              tags: [],
              priceMin: 299,
              isFree: false,
              sourceUrl: "https://townscript.example/with-venue",
            },
          ],
        },
        {
          id: "empty-venue",
          raw: { id: "empty-venue" },
          occurrences: [
            {
              sourceEventId: "empty-venue",
              sourceSlotId: "0",
              slug: "empty-venue-show",
              title: "Empty Venue Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:30:00.000Z",
              endsAt: null,
              venueName: "",
              address: null,
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 199,
              isFree: false,
              sourceUrl: "https://townscript.example/empty-venue",
            },
          ],
        },
        {
          id: "tbd-venue",
          raw: { id: "tbd-venue" },
          occurrences: [
            {
              sourceEventId: "tbd-venue",
              sourceSlotId: "0",
              slug: "tbd-venue-show",
              title: "TBD Venue Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T15:30:00.000Z",
              endsAt: null,
              venueName: "TBD",
              address: null,
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 99,
              isFree: false,
              sourceUrl: "https://townscript.example/tbd-venue",
            },
          ],
        },
      ],
    },
  });

  // Rows remain in DB (do not invent / delete venues).
  const kept = db
    .prepare("SELECT COUNT(*) AS c FROM event WHERE status = 'active' AND slug IN ('empty-venue-show', 'tbd-venue-show')")
    .get() as { c: number };
  expect(kept.c).toBe(2);

  const listing = siteResponse(db, new Request("http://localhost/"), () => new Date("2026-09-08T12:00:00Z"));
  const body = await listing.text();
  expect(listing.status).toBe(200);
  expect(body).toContain("Named Venue Show");
  expect(body).not.toContain("Empty Venue Show");
  expect(body).not.toContain("TBD Venue Show");
  expect(body).not.toContain("Venue TBA");

  const emptyDetail = siteResponse(db, new Request("http://localhost/e/empty-venue-show"));
  expect(emptyDetail.status).toBe(404);
  const tbdDetail = siteResponse(db, new Request("http://localhost/e/tbd-venue-show"));
  expect(tbdDetail.status).toBe(404);
  const okDetail = siteResponse(db, new Request("http://localhost/e/named-venue-show"));
  expect(okDetail.status).toBe(200);
  db.close();
});

test("delisted events are not available through detail routes", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  db.prepare("UPDATE event SET status = 'delisted'").run();

  const response = siteResponse(db, new Request("http://localhost/e/comedy-in-gachibowli"));

  expect(response.status).toBe(404);
  db.close();
});

test("GET /api/events returns listing-eligible JSON with filters", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const response = siteResponse(
    db,
    new Request("http://localhost/api/events?area=gachibowli&category=comedy&free=true&limit=10"),
    () => new Date("2026-09-08T12:00:00Z"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  const body = (await response.json()) as {
    generated_at: string;
    timezone: string;
    city: string;
    count: number;
    next_cursor: string | null;
    events: Array<{
      id: string;
      url: string;
      title: string;
      starts_at: string;
      starts_at_local: string;
      ends_at: string | null;
      category: string | null;
      venue: { name: string; area: string; lat: number | null; lng: number | null };
      is_free: boolean;
      price_min: number | null;
      price_max: number | null;
      currency: string;
      source: { name: string; url: string };
      ticket_url: string;
      image_url: string | null;
    }>;
  };
  expect(body.timezone).toBe("Asia/Kolkata");
  expect(body.city).toBe("Hyderabad");
  expect(body.next_cursor).toBeNull();
  expect(body.count).toBe(1);
  const ev = body.events[0]!;
  expect(ev.title).toBe("Comedy in Gachibowli");
  expect(ev.url).toBe(`http://localhost/e/${ev.id}`);
  expect(ev.starts_at_local).toMatch(/\+05:30$/);
  expect(ev.category).toBe("comedy");
  expect(ev.is_free).toBe(true);
  expect(ev.currency).toBe("INR");
  expect(ev.price_max).toBeNull();
  expect(ev.image_url).toBeNull();
  expect(ev.venue.name).toBe("Gachibowli Arena");
  expect(ev.venue.area).toBe("gachibowli");
  expect(ev.source.name).toBe("communitie");
  expect(ev.source.url).toContain("communitie");
  // §10.1 list item should not leak internal extras
  expect("public_id" in ev).toBe(false);
  expect("categories" in ev).toBe(false);
  expect("description" in ev).toBe(false);
  db.close();
});

test("GET /api/events/:slug returns one event and 404s empty venues", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      townscript: [
        {
          id: "with-venue",
          raw: { id: "with-venue" },
          occurrences: [
            {
              sourceEventId: "with-venue",
              sourceSlotId: "0",
              slug: "named-venue-show",
              title: "Named Venue Show",
              description: "A fun night",
              timeKind: "timed" as const,
              startsAt: "2026-09-10T13:30:00.000Z",
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: null,
              longitude: null,
              categories: ["comedy"],
              tags: [],
              priceMin: 299,
              isFree: false,
              sourceUrl: "https://townscript.example/with-venue",
            },
          ],
        },
        {
          id: "empty-venue",
          raw: { id: "empty-venue" },
          occurrences: [
            {
              sourceEventId: "empty-venue",
              sourceSlotId: "0",
              slug: "empty-venue-show",
              title: "Empty Venue Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:30:00.000Z",
              endsAt: null,
              venueName: "",
              address: null,
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 199,
              isFree: false,
              sourceUrl: "https://townscript.example/empty-venue",
            },
          ],
        },
      ],
    },
  });

  const ok = siteResponse(db, new Request("http://localhost/api/events/named-venue-show"));
  expect(ok.status).toBe(200);
  const okBody = (await ok.json()) as { title: string; description: string; url: string };
  expect(okBody.title).toBe("Named Venue Show");
  expect(okBody.description).toBe("A fun night");
  expect(okBody.url).toMatch(/\/e\/[0-9a-f-]{36}$/);

  const missing = siteResponse(db, new Request("http://localhost/api/events/empty-venue-show"));
  expect(missing.status).toBe(404);

  const ics = siteResponse(db, new Request("http://localhost/e/named-venue-show.ics"));
  expect(ics.status).toBe(200);
  expect(ics.headers.get("content-type")).toContain("text/calendar");
  const icsBody = await ics.text();
  expect(icsBody).toContain("BEGIN:VEVENT");
  expect(icsBody).toContain("Named Venue Show");
  db.close();
});

test("GET /api/events honors max_price and §10.1 detail fields", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      townscript: [
        {
          id: "cheap",
          raw: { id: "cheap" },
          occurrences: [
            {
              sourceEventId: "cheap",
              sourceSlotId: "0",
              slug: "cheap-show",
              title: "Cheap Show",
              description: "Budget night",
              timeKind: "timed" as const,
              startsAt: "2026-09-10T13:30:00.000Z",
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: 17.44,
              longitude: 78.35,
              categories: ["comedy"],
              tags: [],
              priceMin: 199,
              isFree: false,
              sourceUrl: "https://townscript.example/cheap",
            },
          ],
        },
        {
          id: "pricey",
          raw: { id: "pricey" },
          occurrences: [
            {
              sourceEventId: "pricey",
              sourceSlotId: "0",
              slug: "pricey-show",
              title: "Pricey Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:30:00.000Z",
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 999,
              isFree: false,
              sourceUrl: "https://townscript.example/pricey",
            },
          ],
        },
      ],
    },
  });

  const filtered = siteResponse(
    db,
    new Request("http://localhost/api/events?max_price=300&limit=20"),
    () => new Date("2026-09-08T12:00:00Z"),
  );
  const filteredBody = (await filtered.json()) as { events: Array<{ title: string }> };
  expect(filteredBody.events.map((e) => e.title)).toEqual(["Cheap Show"]);

  const detail = siteResponse(db, new Request("http://localhost/api/events/cheap-show"));
  const detailBody = (await detail.json()) as {
    description: string;
    alternate_ticket_urls: string[];
    venue: { lat: number; lng: number };
  };
  expect(detailBody.description).toBe("Budget night");
  expect(detailBody.alternate_ticket_urls).toEqual([]);
  expect(detailBody.venue.lat).toBe(17.44);
  expect(detailBody.venue.lng).toBe(78.35);
  db.close();
});

test("GET /events.ics returns next-30d listing-eligible calendar", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const response = siteResponse(db, new Request("http://localhost/events.ics"), () => new Date("2026-09-08T12:00:00Z"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/calendar");
  const body = await response.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toContain("Comedy in Gachibowli");
  expect(body).toContain("UID:");
  db.close();
});

test("detail HTML embeds schema.org Event JSON-LD", async () => {
  const response = await responseFor("/e/comedy-in-gachibowli");
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body).toContain('type="application/ld+json"');
  expect(body).toContain('"@type":"Event"');
  expect(body).toContain('"addressLocality":"Hyderabad"');
  expect(body).toContain('"addressRegion":"TS"');
  expect(body).toContain('"addressCountry":"IN"');
  expect(body).toContain('"streetAddress":"Gachibowli, Hyderabad"');
  expect(body).toContain("OfflineEventAttendanceMode");
  expect(body).toContain('"priceCurrency":"INR"');
  expect(body).not.toContain('"endDate"');
});

test("JSON-LD omits empty streetAddress and endDate when end <= start", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      luma: [
        {
          id: "bad-end",
          raw: { id: "bad-end" },
          occurrences: [
            {
              sourceEventId: "bad-end",
              sourceSlotId: "0",
              slug: "bad-end-show",
              title: "Bad End Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:00:00.000Z",
              endsAt: "2026-09-10T13:00:00.000Z",
              venueName: "Empty Address Hall",
              address: "   ",
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 0,
              isFree: true,
              sourceUrl: "https://example.com/bad-end",
            },
          ],
        },
        {
          id: "good-end",
          raw: { id: "good-end" },
          occurrences: [
            {
              sourceEventId: "good-end",
              sourceSlotId: "0",
              slug: "good-end-show",
              title: "Good End Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:00:00.000Z",
              endsAt: "2026-09-10T16:00:00.000Z",
              venueName: "Street Hall",
              address: "Road No 1",
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 0,
              isFree: true,
              sourceUrl: "https://example.com/good-end",
            },
          ],
        },
      ],
    },
  });
  const now = () => new Date("2026-09-08T12:00:00Z");

  const bad = await siteResponse(db, new Request("http://localhost/e/bad-end-show"), now).text();
  expect(bad).toContain('"@type":"Event"');
  expect(bad).not.toContain('"streetAddress"');
  expect(bad).not.toContain('"endDate"');

  const good = await siteResponse(db, new Request("http://localhost/e/good-end-show"), now).text();
  expect(good).toContain('"streetAddress":"Road No 1"');
  expect(good).toContain('"endDate"');
  db.close();
});

test("llms.txt robots.txt and sitemap stubs point at the JSON feed", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const now = () => new Date("2026-09-08T12:00:00Z");

  const llms = siteResponse(db, new Request("http://localhost/llms.txt"), now);
  expect(llms.status).toBe(200);
  const llmsBody = await llms.text();
  expect(llmsBody).toContain("/api/events");
  expect(llmsBody).toContain("Asia/Kolkata");
  expect(llmsBody).toContain("/events.ics");

  const robots = siteResponse(db, new Request("http://localhost/robots.txt"), now);
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = siteResponse(db, new Request("http://localhost/sitemap.xml"), now);
  const sm = await sitemap.text();
  expect(sm).toContain("<urlset");
  expect(sm).toContain("/api/events");
  expect(sm).toMatch(/\/e\/[0-9a-f-]{36}/);
  expect(sm).toContain("/v/gachibowli-arena");
  expect(sm).toContain("/in/gachibowli");
  expect(sm).toContain("/c/comedy");
  expect(sm).toContain("/in/gachibowli/this-weekend");
  expect(sm).toContain("/in/gachibowli/c/comedy");
  expect(sm).toContain("/tools/whats_on_this_weekend");
  // Fixture starts Sat 12 Sep — not on "today" for Tue 8 Sep
  expect(sm).not.toContain("http://localhost/today</loc>");
  expect(sm).not.toContain("http://localhost/tonight</loc>");
  db.close();
});

test("sitemap never links an /in/{area} or /in/{area}/c/{category} page that would 404", async () => {
  const db = memoryDb();
  const now = () => new Date("2026-09-08T12:00:00Z");
  // Event lands 40 days out — outside the /in/{area} route's 7-day default window.
  await runSync({
    db,
    fetchedBySource: communitieItems([
      event({
        id: "far-out",
        slug: "far-out-gig",
        title: "Far Out Gig",
        categories: [{ slug: "music" }],
        timeSlots: [
          {
            venueName: "Distant Hall",
            address: "Kompally, Hyderabad",
            scheduleSlots: [{ id: "slot-far", slotDate: "2026-10-18", startTime: "19:00:00" }],
          },
        ],
      }),
    ]),
  });

  const sm = await siteResponse(db, new Request("http://localhost/sitemap.xml"), now).text();
  // The event page itself is always linkable...
  expect(sm).toMatch(/\/e\/[0-9a-f-]{36}/);
  // ...but the area/category listing pages 404 outside the 7-day window, so they must not be linked.
  expect(sm).not.toContain("/in/kompally</loc>");
  expect(sm).not.toContain("/c/music</loc>");
  expect(sm).not.toContain("/in/kompally/c/music");
  expect(sm).not.toContain("/free</loc>");
  expect(sm).not.toContain("/this-weekend</loc>");

  const areaPage = siteResponse(db, new Request("http://localhost/in/kompally"), now);
  expect(areaPage.status).toBe(404);
  expect(siteResponse(db, new Request("http://localhost/free"), now).status).toBe(404);
  expect(siteResponse(db, new Request("http://localhost/this-weekend"), now).status).toBe(404);
  db.close();
});

test("sync resolves venue_name_raw into venue rows and venue_id", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const venues = db.prepare("SELECT id, name, name_key, geocode_state, lat, lng FROM venue").all() as Array<{
    id: string;
    name: string;
    name_key: string;
    geocode_state: string;
    lat: number | null;
    lng: number | null;
  }>;
  expect(venues.length).toBe(1);
  expect(venues[0]!.name).toBe("Gachibowli Arena");
  expect(venues[0]!.name_key).toBe("gachibowli arena");
  // The event carried no point, but the venue name says Gachibowli, so it sits at the area centre.
  expect(venues[0]!.geocode_state).toBe("approximate");
  expect(venues[0]!.lat).toBe(AREA_CENTRES.gachibowli.lat);

  const row = db.prepare("SELECT venue_id, venue_name FROM event").get() as { venue_id: string; venue_name: string };
  expect(row.venue_id).toBe(venues[0]!.id);
  expect(row.venue_name).toBe("Gachibowli Arena");

  // Second sync with same venue name reuses the venue id
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const count = db.prepare("SELECT COUNT(*) AS c FROM venue").get() as { c: number };
  expect(count.c).toBe(1);
  db.close();
});

test("GET /feeds/{category|area}.ics returns listing-eligible calendars", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const now = () => new Date("2026-09-08T12:00:00Z");

  const cat = siteResponse(db, new Request("http://localhost/feeds/comedy.ics"), now);
  expect(cat.status).toBe(200);
  expect(await cat.text()).toContain("Comedy in Gachibowli");

  const area = siteResponse(db, new Request("http://localhost/feeds/gachibowli.ics"), now);
  expect(area.status).toBe(200);
  expect(await area.text()).toContain("BEGIN:VEVENT");

  const miss = siteResponse(db, new Request("http://localhost/feeds/not-a-real-slug.ics"), now);
  expect(miss.status).toBe(404);
  db.close();
});

test("venue pages use the resolved venue and 404 when it has no upcoming events", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const now = () => new Date("2026-09-08T12:00:00Z");

  const venue = siteResponse(db, new Request("http://localhost/v/gachibowli-arena"), now);
  expect(venue.status).toBe(200);
  expect(await venue.text()).toContain("Events at Gachibowli Arena");

  db.prepare("UPDATE event SET starts_at = '2027-10-01T13:30:00.000Z'").run();
  expect(siteResponse(db, new Request("http://localhost/v/gachibowli-arena"), now).status).toBe(404);
  db.close();
});

test("ICS uses an IST timezone and folds escaped long descriptions", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  db.prepare("UPDATE event SET description = ?").run(`Line one, with punctuation; ${"x".repeat(100)}\nLine two`);
  const response = siteResponse(db, new Request("http://localhost/e/comedy-in-gachibowli.ics"));
  const body = await response.text();

  expect(body).toContain("X-WR-TIMEZONE:Asia/Kolkata");
  expect(body).toContain("DTSTART;TZID=Asia/Kolkata:20260912T190000");
  expect(body).toContain("DESCRIPTION:Line one\\, with punctuation\\;");
  expect(body).toContain("\r\n ");
  expect(body).toMatch(/URL:http:\/\/localhost\/e\/[0-9a-f-]{36}/);
  db.close();
});

test("ICS clamps DTEND when end <= start and keeps absolute event URL", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      luma: [
        {
          id: "bad-end-ics",
          raw: { id: "bad-end-ics" },
          occurrences: [
            {
              sourceEventId: "bad-end-ics",
              sourceSlotId: "0",
              slug: "bad-end-ics-show",
              title: "Bad End ICS",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:00:00.000Z",
              endsAt: "2026-09-10T13:00:00.000Z",
              venueName: "Clamp Hall",
              address: "Road 1",
              latitude: null,
              longitude: null,
              categories: ["music"],
              tags: [],
              priceMin: 0,
              isFree: true,
              sourceUrl: "https://example.com/bad-end-ics",
            },
          ],
        },
      ],
    },
  });
  const response = siteResponse(db, new Request("http://localhost:3000/e/bad-end-ics-show.ics"));
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body).toContain("DTSTART;TZID=Asia/Kolkata:20260910T193000");
  // end <= start → default +2h from start (14:00Z + 2h = 16:00Z = 21:30 IST)
  expect(body).toContain("DTEND;TZID=Asia/Kolkata:20260910T213000");
  expect(body).not.toContain("DTEND;TZID=Asia/Kolkata:20260910T183000");
  expect(body).toMatch(/URL:http:\/\/localhost:3000\/e\/[0-9a-f-]{36}/);
  db.close();
});

test("thin /tools/search_events and /tools/get_event wrap the JSON API", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const now = () => new Date("2026-09-08T12:00:00Z");

  const search = siteResponse(db, new Request("http://localhost/tools/search_events?area=gachibowli&limit=5"), now);
  const searchBody = (await search.json()) as { events: Array<{ title: string }> };
  expect(search.status).toBe(200);
  expect(searchBody.events[0]!.title).toBe("Comedy in Gachibowli");

  const get = siteResponse(db, new Request("http://localhost/tools/get_event?id=comedy-in-gachibowli"), now);
  expect(get.status).toBe(200);
  expect(((await get.json()) as { title: string }).title).toBe("Comedy in Gachibowli");
  db.close();
});

test("§10.4 tool stubs: whats_on_this_weekend, list_venues, list_areas", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  const now = () => new Date("2026-09-08T12:00:00Z");

  const weekend = siteResponse(db, new Request("http://localhost/tools/whats_on_this_weekend?area=gachibowli"), now);
  expect(weekend.status).toBe(200);
  const wBody = (await weekend.json()) as {
    events: Array<{ title: string }>;
    window: { from: string; to: string };
  };
  expect(wBody.window.from).toBe("2026-09-11");
  expect(wBody.window.to).toBe("2026-09-13");
  expect(wBody.events[0]!.title).toBe("Comedy in Gachibowli");

  const venues = siteResponse(db, new Request("http://localhost/tools/list_venues"), now);
  expect(venues.status).toBe(200);
  const vBody = (await venues.json()) as { venues: Array<{ name: string; upcoming_count: number }> };
  expect(vBody.venues.some((v) => v.name === "Gachibowli Arena" && v.upcoming_count >= 1)).toBe(true);

  const areas = siteResponse(db, new Request("http://localhost/tools/list_areas"), now);
  expect(areas.status).toBe(200);
  const aBody = (await areas.json()) as { areas: Array<{ slug: string; label: string; event_count: number }> };
  const gachi = aBody.areas.find((a) => a.slug === "gachibowli");
  expect(gachi?.label).toBe("Gachibowli");
  expect(gachi!.event_count).toBeGreaterThanOrEqual(1);
  db.close();
});

test("programmatic /this-weekend and /in/{area} stubs render or 404 empty", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  // 2026-09-08 is Tuesday; weekend window is Fri 11–Sun 13 Sep — fixture is Sat 12 Sep → included.
  const now = () => new Date("2026-09-08T12:00:00Z");

  const weekend = siteResponse(db, new Request("http://localhost/this-weekend"), now);
  expect(weekend.status).toBe(200);
  expect(await weekend.text()).toContain("Comedy in Gachibowli");

  const area = siteResponse(db, new Request("http://localhost/in/gachibowli"), now);
  expect(area.status).toBe(200);
  expect(await area.text()).toContain("Events in gachibowli");

  const hyd = siteResponse(db, new Request("http://localhost/hyderabad/gachibowli/this-weekend"), now);
  expect(hyd.status).toBe(200);

  const emptyArea = siteResponse(db, new Request("http://localhost/in/sangareddy"), now);
  expect(emptyArea.status).toBe(404);
  db.close();
});

test("programmatic /today and /tonight use Asia/Kolkata day bounds; empty → 404", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event()]) });
  // Fixture: 2026-09-12 19:00 IST. On Tue 8 Sep those pages are empty.
  const tue = () => new Date("2026-09-08T12:00:00Z");
  expect(siteResponse(db, new Request("http://localhost/today"), tue).status).toBe(404);
  expect(siteResponse(db, new Request("http://localhost/tonight"), tue).status).toBe(404);

  // On Sat 12 Sep 10:00 IST (= 04:30Z): /today includes 19:00; /tonight (from 17:00) also includes it.
  const satMorning = () => new Date("2026-09-12T04:30:00Z");
  const today = siteResponse(db, new Request("http://localhost/today"), satMorning);
  expect(today.status).toBe(200);
  const todayBody = await today.text();
  expect(todayBody).toContain("Today in Hyderabad");
  expect(todayBody).toContain("Comedy in Gachibowli");

  const tonight = siteResponse(db, new Request("http://localhost/tonight"), satMorning);
  expect(tonight.status).toBe(200);
  expect(await tonight.text()).toContain("Comedy in Gachibowli");

  // Afternoon before 17:00 IST still lists tonight's 19:00 show; an early-day-only event would not.
  // Add a noon event and ensure /tonight excludes it while /today includes it.
  await runSync({
    db,
    fetchedBySource: {
      luma: [
        {
          id: "noon",
          raw: { id: "noon" },
          occurrences: [
            {
              sourceEventId: "noon",
              sourceSlotId: "0",
              slug: "noon-brunch",
              title: "Noon Brunch",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-12T06:30:00.000Z", // 12:00 IST
              endsAt: null,
              venueName: "Gachibowli Arena",
              address: "Gachibowli",
              latitude: null,
              longitude: null,
              categories: ["food"],
              tags: [],
              priceMin: 0,
              isFree: true,
              sourceUrl: "https://example.com/noon",
            },
          ],
        },
      ],
    },
  });
  const today2 = await siteResponse(db, new Request("http://localhost/today"), satMorning).text();
  expect(today2).toContain("Noon Brunch");
  const tonight2 = await siteResponse(db, new Request("http://localhost/tonight"), satMorning).text();
  expect(tonight2).not.toContain("Noon Brunch");
  expect(tonight2).toContain("Comedy in Gachibowli");

  // Sitemap on Sat morning should list /today and /tonight
  const sm = await siteResponse(db, new Request("http://localhost/sitemap.xml"), satMorning).text();
  expect(sm).toContain("/today");
  expect(sm).toContain("/tonight");
  db.close();
});

test("GET /api/events?lat&lng sorts by distance when coords exist", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      luma: [
        {
          id: "near",
          raw: { id: "near" },
          occurrences: [
            {
              sourceEventId: "near",
              sourceSlotId: "0",
              slug: "near-show",
              title: "Near Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T14:00:00.000Z",
              endsAt: null,
              venueName: "Near Venue",
              address: "Gachibowli",
              latitude: 17.44,
              longitude: 78.35,
              categories: ["music"],
              tags: [],
              priceMin: 0,
              isFree: true,
              sourceUrl: "https://example.com/near",
            },
          ],
        },
        {
          id: "far",
          raw: { id: "far" },
          occurrences: [
            {
              sourceEventId: "far",
              sourceSlotId: "0",
              slug: "far-show",
              title: "Far Show",
              description: null,
              timeKind: "timed" as const,
              startsAt: "2026-09-10T13:00:00.000Z",
              endsAt: null,
              venueName: "Far Venue",
              address: "Uppal",
              latitude: 17.4,
              longitude: 78.55,
              categories: ["music"],
              tags: [],
              priceMin: 0,
              isFree: true,
              sourceUrl: "https://example.com/far",
            },
          ],
        },
      ],
    },
  });
  const res = siteResponse(
    db,
    new Request("http://localhost/api/events?lat=17.44&lng=78.35&radius_km=50&limit=10"),
    () => new Date("2026-09-08T12:00:00Z"),
  );
  const body = (await res.json()) as { events: Array<{ title: string }> };
  expect(body.events.map((e) => e.title)).toEqual(["Near Show", "Far Show"]);
  db.close();
});

const occurrence = (id: string, sourceEventId: string, startsAt: string, source = "bookmyshow") => ({
  id,
  sourceEventId,
  source,
  publicId: id,
  title: "Nayi Dosti",
  timeKind: "timed" as const,
  startsAt,
  endsAt: null,
  venueName: "Phoenix Arena",
  address: null,
  area: "gachibowli",
  latitude: null,
  longitude: null,
  categories: "[]",
  category: "community" as const,
  isFree: 0,
  priceMin: 249,
  sourceUrl: "https://example.test",
  description: null,
});

test("collapses a multi-date run to one card carrying the extra-date count", () => {
  const entries = collapseRuns([
    occurrence("a", "evt-1", "2026-09-12T13:30:00.000Z"),
    occurrence("b", "evt-1", "2026-09-13T13:30:00.000Z"),
    occurrence("c", "evt-1", "2026-09-14T13:30:00.000Z"),
  ]);
  expect(entries).toHaveLength(1);
  expect(entries[0]!.row.id).toBe("a");
  expect(entries[0]!.moreDates).toBe(2);
});

test("keeps distinct records apart even when they share a title and venue", () => {
  const entries = collapseRuns([
    occurrence("a", "evt-1", "2026-09-12T13:30:00.000Z"),
    occurrence("b", "evt-2", "2026-09-12T13:30:00.000Z"),
    occurrence("c", "evt-1", "2026-09-13T13:30:00.000Z", "district"),
  ]);
  expect(entries.map((entry) => entry.row.id)).toEqual(["a", "b", "c"]);
  expect(entries.every((entry) => entry.moreDates === 0)).toBe(true);
});

test("the listing collapses a run while the API keeps every occurrence", async () => {
  const db = memoryDb();
  const dates = ["2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15"];
  await runSync({
    db,
    fetchedBySource: {
      bookmyshow: [
        {
          id: "run-1",
          raw: { id: "run-1" },
          occurrences: dates.map((day, index) => ({
            sourceEventId: "run-1",
            sourceSlotId: `slot-${index}`,
            slug: `nayi-dosti-${index}`,
            title: "Nayi Dosti",
            description: null,
            timeKind: "timed" as const,
            startsAt: `${day}T13:30:00.000Z`,
            endsAt: null,
            venueName: "Phoenix Arena",
            address: null,
            latitude: null,
            longitude: null,
            categories: [],
            tags: [],
            priceMin: 249,
            isFree: false,
            sourceUrl: "https://example.test",
          })),
        },
      ],
    },
  });

  const now = () => new Date("2026-09-12T00:00:00Z");
  const html = await siteResponse(db, new Request("http://localhost/"), now).text();
  expect(html.match(/Nayi Dosti/g)).toHaveLength(1);
  expect(html).toContain("+3 more dates");

  const api = (await siteResponse(db, new Request("http://localhost/api/events"), now).json()) as { events: unknown[] };
  expect(api.events).toHaveLength(4);
  db.close();
});

test("the event type filter works on the classified category, not the source's label", async () => {
  const db = memoryDb();
  await runSync({
    db,
    now: NOW,
    fetchedBySource: {
      bookmyshow: [
        fetchedItem("bms-1", { title: "Standup Night", categories: ["Comedy Shows"] }),
        fetchedItem("bms-2", { title: "Rock Gig", categories: ["Music Shows"] }),
      ],
    },
  });

  const titles = async (query: string) =>
    (
      (await siteResponse(db, new Request(`http://localhost/api/events?${query}`), NOW).json()) as {
        events: { title: string }[];
      }
    ).events.map((event) => event.title);

  expect(await titles("category=comedy")).toEqual(["Standup Night"]);
  expect(await titles("category=music")).toEqual(["Rock Gig"]);
  expect(siteResponse(db, new Request("http://localhost/api/events?category=Comedy%20Shows"), NOW).status).toBe(400);
  db.close();
});

test("the source filter narrows to one source", async () => {
  const db = memoryDb();
  await runSync({
    db,
    now: NOW,
    fetchedBySource: {
      bookmyshow: [fetchedItem("bms-1", { title: "Standup Night", categories: ["Comedy Shows"] })],
      luma: [fetchedItem("luma-1", { title: "Founders Meetup" })],
    },
  });

  const body = await siteResponse(db, new Request("http://localhost/?source=luma"), NOW).text();
  expect(body).toContain("Founders Meetup");
  expect(body).not.toContain("Standup Night");
  db.close();
});

test("the filter form offers every filter, with counts, and only values that have events", async () => {
  const db = memoryDb();
  await runSync({
    db,
    now: NOW,
    fetchedBySource: {
      bookmyshow: [
        fetchedItem("bms-1", { title: "Standup Night", categories: ["Comedy Shows"] }),
        fetchedItem("bms-2", { title: "Another Standup", categories: ["Comedy Shows"] }),
      ],
    },
  });
  const body = await siteResponse(db, new Request("http://localhost/"), NOW).text();

  for (const field of ['name="category"', 'name="source"', 'name="area"', 'name="from"', 'name="to"', 'name="free"', 'name="max_price"']) {
    expect(body).toContain(field);
  }
  expect(body).toContain("Comedy (2)");
  expect(body).toContain("Bookmyshow (2)");
  // Nothing is filed under music, so offering it would be a dead end.
  expect(body).not.toContain(">Music (");
  db.close();
});

test("a selected value survives even when nothing currently matches it", async () => {
  const db = memoryDb();
  await runSync({ db, now: NOW, fetchedBySource: communitieItems([event()]) });
  const body = await siteResponse(db, new Request("http://localhost/?category=film"), NOW).text();

  expect(body).toContain('value="film" selected');
  expect(body).toContain("Clear filters");
  db.close();
});

test("quick date links are offered alongside the form", async () => {
  const db = memoryDb();
  await runSync({ db, now: NOW, fetchedBySource: communitieItems([event()]) });
  const body = await siteResponse(db, new Request("http://localhost/"), NOW).text();

  for (const href of ['href="/today"', 'href="/tonight"', 'href="/this-weekend"', 'href="/free"']) {
    expect(body).toContain(href);
  }
  db.close();
});

test("each slot's public URL round-trips through detail and single-event ICS", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: communitieItems([
      event({
        timeSlots: [
          {
            venueName: "Gachibowli Arena",
            scheduleSlots: [
              { id: "one", slotDate: "2026-09-12", startTime: "19:00:00" },
              { id: "two", slotDate: "2026-09-13", startTime: "20:00:00" },
            ],
          },
        ],
      }),
    ]),
  });
  const list = (await siteResponse(db, new Request("http://localhost/api/events"), NOW).json()) as {
    events: { id: string; url: string; starts_at: string }[];
  };
  expect(new Set(list.events.map((row) => row.url)).size).toBe(2);
  for (const row of list.events) {
    const detail = (await siteResponse(db, new Request(row.url.replace("/e/", "/api/events/")), NOW).json()) as {
      id: string;
      starts_at: string;
    };
    expect(detail.id).toBe(row.id);
    expect(detail.starts_at).toBe(row.starts_at);
    const ics = await siteResponse(db, new Request(`${row.url}.ics`), NOW).text();
    expect(ics).toContain(`UID:${row.id}@hydsocial.in`);
    expect(ics).toContain(row.starts_at.startsWith("2026-09-12") ? "20260912T190000" : "20260913T200000");
  }
  expect(siteResponse(db, new Request("http://localhost/e/comedy-in-gachibowli"), NOW).status).toBe(404);
  db.close();
});

test("API and sitemap use stored classified categories rather than source labels", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: [fetchedItem("labels", { title: "Standup Night", categories: ["Comedy Shows"] })] } });
  const list = (await siteResponse(db, new Request("http://localhost/api/events"), NOW).json()) as {
    events: Array<{ id: string; category: string }>;
  };
  expect(list.events[0]!.category).toBe("comedy");
  const detail = (await siteResponse(db, new Request(`http://localhost/api/events/${list.events[0]!.id}`), NOW).json()) as {
    category: string;
  };
  expect(detail.category).toBe("comedy");
  const sitemap = await siteResponse(db, new Request("http://localhost/sitemap.xml"), NOW).text();
  expect(sitemap).toContain("http://localhost/c/comedy</loc>");
  expect(sitemap).toContain("http://localhost/feeds/comedy.ics</loc>");
  expect(sitemap).not.toContain("Comedy Shows");
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    expect(siteResponse(db, new Request(match[1]!), NOW).status).toBe(200);
  }
  db.close();
});

test("public rendering refuses unsafe source URLs already in the database", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: [fetchedItem("unsafe")] } });
  db.exec("UPDATE event SET source_url = 'javascript:alert(1)'");
  const id = (db.query("SELECT id FROM event").get() as { id: string }).id;
  const html = await siteResponse(db, new Request(`http://localhost/e/${id}`), NOW).text();
  expect(html).not.toContain("javascript:");
  const api = (await siteResponse(db, new Request(`http://localhost/api/events/${id}`), NOW).json()) as {
    source: { url: string | null };
    ticket_url: string | null;
  };
  expect(api.source.url).toBeNull();
  expect(api.ticket_url).toBeNull();
  const ics = await siteResponse(db, new Request(`http://localhost/e/${id}.ics`), NOW).text();
  expect(ics).not.toContain("javascript:");
  db.close();
});

test("the map page and /api/map refuse unsafe source URLs too", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: [fetchedItem("unsafe")] } });
  db.exec("UPDATE event SET source_url = 'javascript:alert(1)'");
  const id = (db.query("SELECT id FROM event").get() as { id: string }).id;
  const when = () => new Date("2026-10-12T00:00:00Z");
  const wide = "from=2020-01-01&to=2099-01-01";
  const api = (await siteResponse(db, new Request(`http://localhost/api/map?${wide}`), when).json()) as {
    features: Array<{ properties: { events: Array<{ sourceUrl: string | null }> } }>;
  };
  expect(api.features.flatMap((f) => f.properties.events).length).toBeGreaterThan(0);
  expect(api.features.flatMap((f) => f.properties.events).every((e) => e.sourceUrl === null)).toBe(true);
  const html = await siteResponse(db, new Request(`http://localhost/map?event=${id}`), when).text();
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("View on");
  db.close();
});

test("the listing's Next 7 days link runs from today through today + 6 in IST", async () => {
  const db = memoryDb();
  // 2026-10-11 20:00 UTC is already Monday 12 Oct in Hyderabad.
  const body = await siteResponse(db, new Request("http://localhost/"), () => new Date("2026-10-11T20:00:00Z")).text();
  expect(body).toContain('href="/?from=2026-10-12&amp;to=2026-10-18">Next 7 days</a>');
  db.close();
});

test("malformed public paths and filters return 400 without throwing", () => {
  const db = memoryDb();
  for (const path of [
    "/e/%",
    "/api/events/%E0%A4%A",
    "/feeds/%.ics",
    "/v/%FF",
    "/in/%",
    "/api/events?from=nope",
    "/?to=2026-02-31",
    "/events.ics?from=2026-13-01",
    "/tools/search_events?lat=NaN&lng=78",
    "/api/events?lat=91&lng=78",
    "/api/events?lng=78",
    "/api/events?radius_km=-1",
    "/api/events?max_price=-1",
    "/api/events?limit=NaN",
    "/api/events?limit=1.5",
    "/api/events?free=maybe",
    "/api/events?from=2026-10-01&to=2026-09-01",
    "/tools/list_venues?area=unknown",
    "/tools/whats_on_this_weekend?limit=0",
  ]) {
    const response = siteResponse(db, new Request(`http://localhost${path}`), NOW);
    expect({ path, status: response.status }).toEqual({ path, status: 400 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  db.close();
});

test("API keyset pagination visits tied occurrences exactly once and ends with a null cursor", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: Array.from({ length: 205 }, (_, i) => fetchedItem(`page-${i}`)) } });
  db.exec("UPDATE event SET is_canonical = 1");
  const expected = (db.query("SELECT id FROM listable_event ORDER BY starts_at, id").all() as { id: string }[]).map((row) => row.id);
  const visited: string[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("http://localhost/api/events?source=district&limit=40");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = siteResponse(db, new Request(url.toString()), NOW);
    expect(response.status).toBe(200);
    const page = (await response.json()) as { events: { id: string }[]; next_cursor: string | null };
    visited.push(...page.events.map((row) => row.id));
    cursor = page.next_cursor;
    if (visited.length < expected.length) expect(cursor).toBeTypeOf("string");
    expect(visited.length).toBeLessThanOrEqual(expected.length);
  } while (cursor);
  expect(visited).toEqual(expected);
  for (const bad of [
    "garbage",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ kind: "time", startsAt: "bad", id: "x" })).toString("base64url"),
  ]) {
    expect(siteResponse(db, new Request(`http://localhost/api/events?cursor=${bad}`), NOW).status).toBe(400);
  }
  db.close();
});

test("distance pagination covers the complete candidate set with stable ties", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: Array.from({ length: 505 }, (_, i) => fetchedItem(`distance-${i}`)) } });
  db.exec("UPDATE event SET is_canonical = 1, latitude = 18, longitude = 78");
  db.exec("UPDATE event SET latitude = 17 WHERE source_event_id IN ('distance-503', 'distance-504')");
  const expected = (db.query("SELECT id FROM listable_event WHERE latitude = 17 ORDER BY starts_at, id").all() as { id: string }[]).map(
    (row) => row.id,
  );
  const visited: string[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("http://localhost/api/events?lat=17&lng=78&radius_km=1&limit=1");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = (await siteResponse(db, new Request(url.toString()), NOW).json()) as {
      events: { id: string }[];
      next_cursor: string | null;
    };
    visited.push(...page.events.map((row) => row.id));
    cursor = page.next_cursor;
    expect(visited.length).toBeLessThanOrEqual(2);
  } while (cursor);
  expect(visited).toEqual(expected);
  db.close();
});

test("detail pages show the classified category even when source labels are empty", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: [fetchedItem("no-labels", { title: "Standup Night", categories: [] })] } });
  const id = (db.query("SELECT id FROM event").get() as { id: string }).id;
  const html = await siteResponse(db, new Request(`http://localhost/e/${id}`), NOW).text();
  expect(html).toMatch(/<dt>Category<\/dt><dd><span class="m-cat"><svg [^>]*><use href="[^"]+#comedy"><\/use><\/svg>Comedy<\/span><\/dd>/);
  const sitemap = await siteResponse(db, new Request("http://localhost/sitemap.xml"), NOW).text();
  expect(sitemap).toContain("http://localhost/c/comedy</loc>");
  db.close();
});
