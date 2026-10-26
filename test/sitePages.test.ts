import { expect, test } from "bun:test";
import fs from "node:fs";
import type { RawEvent } from "../src/ingestion/sources/communitie.js";
import { runSync } from "../src/ingestion/sync.js";
import { siteResponse } from "../src/web/index.js";
import { listHref, mapHref } from "../src/web/viewLinks.js";
import { communitieItems, memoryDb } from "./helpers.js";

/** S7: the listing, category and area pages and /e/<id> are React components on the shared tokens, with no client bundle. */
const NOW = () => new Date("2026-09-08T12:00:00Z");
const event: RawEvent = {
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
};

async function pages() {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: communitieItems([event]) });
  const get = async (path: string) => siteResponse(db, new Request(`http://localhost${path}`), NOW).text();
  const id = /\/e\/([^"]+)"/.exec(await get("/"))![1]!;
  return { db, get, id };
}

test("the shared filters round-trip between the listing and the map (S7.3)", () => {
  const filters = { category: "comedy", area: "gachibowli", free: true };
  expect(mapHref(filters)).toBe("/map?category=comedy&area=gachibowli&free=1");
  expect(listHref(filters)).toBe("/?category=comedy&area=gachibowli&free=true");
  expect(mapHref({ category: null, area: null, free: false })).toBe("/map");
  expect(listHref({ category: null, area: null, free: false })).toBe("/");
});

test("List and Map links carry category, area and free in both directions (S7.3)", async () => {
  const { db, get } = await pages();
  const listing = await get("/?category=comedy&area=gachibowli&free=true");
  expect(listing).toContain('<a href="/?category=comedy&amp;area=gachibowli&amp;free=true" aria-current="page">List</a>');
  expect(listing).toContain('<a href="/map?category=comedy&amp;area=gachibowli&amp;free=1">Map</a>');
  // A programmatic page (/c/comedy) is the same page: its filters travel too.
  expect(await get("/c/comedy")).toContain('<a href="/map?category=comedy">Map</a>');

  const map = (await get("/map?category=comedy&area=gachibowli&free=1")).replaceAll("<!-- -->", "");
  expect(map).toContain('<a href="/?category=comedy&amp;area=gachibowli&amp;free=true">List</a>');
  // And the listing reads what the map wrote, and the other way round.
  expect(await get("/?free=1")).toContain('name="free" checked=""');
  db.close();
});

test("the listing and event pages run one script, the theme toggle's, and load no map bundle (S7.1)", async () => {
  const { db, get, id } = await pages();
  for (const path of ["/", "/c/comedy", "/in/gachibowli", "/today", `/e/${id}`, "/e/missing"]) {
    const html = await get(path);
    expect(html).not.toMatch(/\/assets\/(map|chunk|maplibre)/);
    expect(html).not.toContain("<script src");
    expect(html).not.toContain('type="module"');
    const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]!.trim());
    // The theme boot in the head, the toggle at the end, and on an event page the JSON-LD data block.
    expect(scripts.filter((s) => s !== 'type="application/ld+json"')).toEqual(["", ""]);
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('class="brand-link"');
    expect(html).toContain("Inter Variable");
    expect(html).toContain('rel="preload" href="/assets/fonts/inter-latin.');
  }
  db.close();
});

test("the pages use the shared tokens and the shared chrome, and no color of their own (S7.1)", async () => {
  const { db, get } = await pages();
  const html = await get("/");
  expect(html).toContain("--color-primary: #1f6f5c"); // the generated DESIGN.md block
  expect(html).toContain(".view-switch");
  expect(html).toContain(".brand-link");
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
  const generated = css.slice(0, css.indexOf("\n.i { flex"));
  expect(css.replace(generated, "")).not.toMatch(/#[0-9a-f]{3,8}(?![\w-])/i);
  for (const file of ["src/web/site/styles.ts", "src/web/ui/chrome.ts"])
    expect(fs.readFileSync(file, "utf8")).not.toMatch(/#[0-9a-f]{3,8}(?![\w-])/i);
  db.close();
});

test("the event page offers the source, the calendar and the map, and keeps its JSON-LD (S7.2)", async () => {
  const { db, get, id } = await pages();
  const html = await get(`/e/${id}`);
  expect(html).toContain(`href="/map?event=${id}"`);
  expect(html).toContain(`href="/e/${id}.ics"`);
  expect(html).toContain('<script type="application/ld+json">');
  expect(html).toContain("<dt>Where</dt><dd>Gachibowli Arena<br/>Gachibowli, Hyderabad</dd>");
  db.close();
});

test("the string templates are gone (S7.2)", () => {
  expect(fs.existsSync("src/web/pages.ts")).toBe(false);
  const text = fs.readFileSync("src/web/pages.tsx", "utf8");
  for (const gone of ["function layout(", "function eventCard(", "function filterForm(", "brandLockup", "themeToggle("])
    expect(text).not.toContain(gone);
  expect(fs.readFileSync("src/web/theme.ts", "utf8")).not.toContain("function themeToggle");
  expect(fs.readFileSync("src/web/brand.ts", "utf8")).not.toContain("brandLockup");
});

test("the event page's Category line is the category icon from the sprite and the word", async () => {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: communitieItems([{ ...event, id: "m", slug: "gig", title: "A gig", categories: [{ slug: "music" }] }]),
  });
  const get = async (path: string) => siteResponse(db, new Request(`http://localhost${path}`), NOW).text();
  const id = /\/e\/([^"]+)"/.exec(await get("/"))![1]!;
  expect(await get(`/e/${id}`)).toMatch(
    /<dd><span class="m-cat"><svg class="i cat-icon"[^>]*aria-hidden="true"[^>]*><use href="\/assets\/icons\/categories\.[0-9a-f]+\.svg#music"><\/use><\/svg>Music<\/span><\/dd>/,
  );
  db.close();
});
