import { expect, test } from "bun:test";
import { resolveVenueId } from "../src/catalog/venue.js";
import { addMuteRule } from "../src/curation/mute.js";
import { siteResponse } from "../src/web/index.js";
import { assetResponse, buildMapAssets, mapAssetsNow } from "../src/web/map/assets.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-10-10T06:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

function seed() {
  const db = memoryDb();
  const hall = resolveVenueId(db, { name: "Exact Hall", area: "other", latitude: 17.4165, longitude: 78.4392 })!;
  const cafe = resolveVenueId(db, { name: "Rough Cafe", area: "gachibowli" })!;
  const insert = db.prepare(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, venue_id, venue_name, category, is_free, source_url, content_hash,
       first_seen_at, last_seen_at, last_seen_run_id, updated_at) VALUES (?, ?, 's', ?, ?, ?, ?, ?, ?, 'https://example.com/e', 'h', ?, ?, 'r', ?)`,
  );
  insert.run("a", "a", "Jazz <night>", at(1), hall, "Exact Hall", "music", 0, at(0), at(0), at(0));
  insert.run("b", "b", "Free comedy", at(2), cafe, "Rough Cafe", "comedy", 1, at(0), at(0), at(0));
  return db;
}
const BOOT = /<script type="application\/json" id="map-boot">[\s\S]*?<\/script>/;
const raw = async (db: ReturnType<typeof memoryDb>, path: string) =>
  siteResponse(db, new Request(`http://localhost${path}`), () => NOW).text();
/** The page as the reader sees it: the embedded boot snapshot lists every event, so it is cut out before looking for absent text. */
const page = async (db: ReturnType<typeof memoryDb>, path: string) => (await raw(db, path)).replace(BOOT, "");

test("/map works without JavaScript: events grouped by type, pills as links, escaped titles", async () => {
  const html = await page(seed(), "/map");
  expect(html).toContain("2 events · 2 venues");
  expect(html).toContain('class="gh"');
  expect(html).toContain("Exact Hall"); // the venue is a property of each row
  expect(html).toContain('href="/map?group=day"');
  expect(html).toContain('href="/map?group=venue"');
  expect(html).toContain("Jazz &lt;night&gt;");
  expect(html).toContain('href="/map?when=tonight"');
  expect(html).toContain("event=a");
  expect(html).not.toContain('<script type="module"');
  expect(html).toContain("OpenStreetMap");
  expect(html).toContain("OpenFreeMap");
});

test("/map filters and the selected venue come from the URL", async () => {
  const db = seed();
  const free = await page(db, "/map?free=1");
  expect(free).toContain("1 event · 1 venue");
  expect(free).not.toContain("Jazz");
  const selected = await page(db, "/map?event=b");
  expect(selected).toContain("All events");
  expect(selected).toContain("exact spot not confirmed");
  expect(selected).toContain("Free comedy");
});

test("an expanded event opens from the URL with its venue, source button, calendar and details links", async () => {
  const html = await page(seed(), "/map?event=a");
  expect(html).toContain("All events");
  expect(html).toContain("View on");
  expect(html).toContain('href="/e/a.ics"');
  expect(html).toContain('href="/e/a"');
  expect(html).toContain("this month");
  expect(html).not.toContain("Free comedy"); // the card shows the one venue
});

test("a date-only event shows the date and no time, in the API and on the page", async () => {
  const db = seed();
  db.prepare("UPDATE event SET time_kind = 'date-only', starts_at = ? WHERE id = 'a'").run("2026-10-11T18:30:00.000Z");
  const api = (await siteResponse(db, new Request("http://localhost/api/map"), () => NOW).json()) as {
    features: { properties: { events: { id: string; timeKind: string }[] } }[];
  };
  expect(api.features.flatMap((f) => f.properties.events).find((e) => e.id === "a")!.timeKind).toBe("date-only");
  const html = await page(db, "/map?event=a");
  expect(html).toContain("Mon 12 Oct");
  expect(html).not.toMatch(/Mon 12 Oct · \d/);
});

test("a date-only start prints no time and a timed one does", async () => {
  const { formatWhen } = await import("../src/web/map/model/format.js");
  expect(formatWhen("2026-10-21T18:30:00.000Z", "date-only")).toBe("Thu 22 Oct");
  expect(formatWhen("2026-10-22T13:30:00.000Z", "timed")).toMatch(/^Thu 22 Oct · 7:00 PM$/);
  const { formatIst } = await import("../src/utils/time.js");
  expect(formatIst("2026-10-22T03:30:00.000Z")).toBe("Thu, 22 Oct at 9:00 AM");
});

test("the rating component renders nothing without a real rating", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Rating } = await import("../src/web/map/components/Rating.js");
  const render = (rating: Parameters<typeof Rating>[0]["rating"]) => renderToStaticMarkup(createElement(Rating, { rating }));
  expect(render(null)).toBe("");
  expect(render(undefined)).toBe("");
  expect(render({ value: 4.6, count: 4, source: "x" })).toBe("");
  expect(render({ value: 0, count: 50, source: "x" })).toBe("");
  expect(render({ value: 4.6, count: 212, source: "BookMyShow" })).toContain("4.6");
});

test("a muted event does not appear on the map page", async () => {
  const db = seed();
  addMuteRule(db, "title", "Free comedy");
  expect(await page(db, "/map")).not.toContain("Free comedy");
});

test("the sitemap and the listing header link to /map", async () => {
  const db = seed();
  expect(await page(db, "/sitemap.xml")).toContain("/map</loc>");
  expect(await page(db, "/")).toContain('href="/map"');
});
test("only /map loads the bundle; the listing never does", async () => {
  const db = seed();
  const assets = await buildMapAssets();
  expect(assets).not.toBeNull();
  const map = await page(db, "/map");
  expect(map).toContain(`src="${assets!.js}"`);
  expect(map).toContain(`href="${assets!.css}"`);
  const listing = await page(db, "/");
  expect(listing).not.toMatch(/\/assets\/(map|chunk|maplibre)/); // Inter is the only asset the listing links
  expect(listing).not.toContain("<script src");
  expect(listing).not.toContain('type="module"');
  expect(listing).not.toContain("maplibre");

  const js = assetResponse(assets!.js)!;
  expect(js.headers.get("content-type")).toContain("javascript");
  expect((await js.arrayBuffer()).byteLength).toBeGreaterThan(100_000);
  expect(mapAssetsNow()!.files.has("/assets/maplibre-worker.js")).toBe(true);
  expect(siteResponse(db, new Request("http://localhost/assets/map.deadbeef.js"), () => NOW).status).toBe(404);
});

test("a venue names its category once when every event shares it", async () => {
  const { venueCategory } = await import("../src/web/map/model/format.js");
  const e = (category: string) => ({ category }) as Parameters<typeof venueCategory>[0][number];
  expect(venueCategory([e("comedy"), e("comedy")])).toBe("comedy");
  expect(venueCategory([e("comedy"), e("music")])).toBeNull();
  expect(venueCategory([])).toBeNull();
});

test("the list groups by type, day or venue from the URL", async () => {
  const db = seed();
  const byVenue = await page(db, "/map?group=venue");
  expect(byVenue).toContain("~ Gachibowli, exact spot not confirmed");
  expect(byVenue).not.toContain('class="gh"');
  const byDay = await page(db, "/map?group=day");
  expect(byDay.match(/class="gh"/g)?.length).toBe(2); // the two events are on different days
  expect(byDay).toMatch(/<a [^>]*aria-current="true"[^>]*href="\/map\?group=day"/);
});

test("the native Type select shows the word only, an option cannot hold an icon", async () => {
  const html = await page(seed(), "/map");
  expect(html).toContain('<option value="comedy">Comedy</option>');
  const { categoryLabel } = await import("../src/catalog/category.js");
  expect(categoryLabel("music")).toBe("Music");
  expect(categoryLabel("unknown")).toBe("Unknown");
});

test("the page ships its snapshot as boot JSON and renders the list for every match before any viewport exists", async () => {
  const html = await raw(seed(), "/map?group=day");
  const boot = JSON.parse(/<script type="application\/json" id="map-boot">([\s\S]*?)<\/script>/.exec(html)![1]!) as {
    data: { features: unknown[] };
    search: string;
    windows: unknown;
    preview: null;
  };
  expect(boot.data.features).toHaveLength(2);
  expect(boot.search).toBe("?group=day"); // the URL state starts from the request's own query string
  expect(boot.preview).toBeNull();
  // Server render: no viewport yet, so the heading counts every match and does not claim "in view".
  const body = html.replace(BOOT, "");
  expect(body).toMatch(/<h2 class="vh inset">2 events<\/h2>/);
  expect(body).not.toContain("in view");
  // The floating count is all matches; the one live region starts empty.
  expect(body).toContain("2 events · 2 venues");
  expect(body.match(/aria-live="polite"/g)).toHaveLength(1);
  expect(body).toMatch(/<p class="sr-only" role="status" aria-live="polite"><\/p>/);
});

test("without JavaScript the pills are links and the search and filters are GET forms", async () => {
  const html = await page(seed(), "/map");
  expect(html).toContain('<form class="pill search" role="search" action="/map" method="get">');
  expect(html).toContain('<form action="/map" method="get">');
  for (const href of ["/map?when=tonight", "/map?when=weekend", "/map?free=1", "/map"]) expect(html).toContain(`href="${href}"`);
  // Near me and the theme toggle need JavaScript, so they start hidden.
  expect(html).toMatch(/id="near" hidden=""/);
  expect(html).toMatch(/id="theme-toggle"[^>]*hidden=""/);
});

test("the top row is brand, search, List / Map, theme, in that order, and works without JavaScript (S6.1)", async () => {
  const html = await page(seed(), "/map");
  const at = (needle: string) => html.indexOf(needle);
  const order = ['class="brand-link"', 'role="search"', 'class="view-switch"', 'id="theme-toggle"'].map(at);
  expect(order.every((i) => i >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(html).toContain('<a href="/">List</a><a href="/map" aria-current="page">Map</a>');
  expect(html).not.toContain("List view");
});

test("the open event renders as one card: a close link and a cover, no thumbnail or Hide details (S6)", async () => {
  const html = await page(seed(), "/map?event=a");
  const open = html.slice(html.indexOf('<li class="row open">'), html.indexOf("</li>", html.indexOf('<li class="row open">')));
  expect(open).toContain('class="close"');
  expect(open).toContain('aria-label="Close Jazz &lt;night&gt;"');
  expect(open).toContain('class="cover"');
  expect(open).not.toContain('class="thumb"');
  expect(open).not.toContain("Hide details");
});

test("events without a known location are counted in the panel heading, which a phone shows (S6 follow-up)", async () => {
  const db = seed();
  const nowhere = resolveVenueId(db, { name: "Nowhere", area: "other" })!;
  db.prepare(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, venue_id, venue_name, category, is_free, source_url, content_hash,
       first_seen_at, last_seen_at, last_seen_run_id, updated_at) VALUES ('c', 'c', 's', 'Lost gig', ?, ?, 'Nowhere', 'music', 0, 'https://example.com/e', 'h', ?, ?, 'r', ?)`,
  ).run(at(1), nowhere, at(0), at(0), at(0));
  const html = (await page(db, "/map")).replaceAll("<!-- -->", "");
  expect(html).toMatch(/<h2 class="vh inset">2 events<span class="unplaced"[^>]*> \+1 unplaced<\/span><\/h2>/);
});
