/** Fixture servers for the browser tests: a seeded SQLite file behind the real site handler, on E2E_PORT. */
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startAdmin } from "../src/admin/start.js";
import { resolveVenueId } from "../src/catalog/venue.js";
import { migrate } from "../src/migrate.js";
import { appLinksFromEnv } from "../src/web/appLinks.js";
import { siteResponse } from "../src/web/index.js";
import { buildMapAssets } from "../src/web/map/assets.js";

/** Saturday 11:30 in Hyderabad; the page and the API both read this clock. */
export const NOW = new Date("2026-10-10T06:00:00Z");
/** Where fixture covers live; the browser tests answer these requests themselves, so nothing leaves the machine. */
export const IMAGE_HOST = "https://img.example.test";
/** The go host the fixture site links "Go with a group" to. */
export const GO_HOST = "go.example.test";
/** The point the tests report as the reader's location. */
export const ORIGIN = { latitude: 17.4126, longitude: 78.4482 };

/** Venues at about 1, 3, 6 and 12 km from ORIGIN, each with two or three events. */
const VENUES = [
  {
    name: "Near Hall",
    lat: 17.4216,
    lng: 78.4482,
    events: [
      ["Jazz night", "music", 30],
      ["Open mic", "comedy", 54],
    ],
  },
  {
    name: "Mid Cafe",
    lat: 17.4396,
    lng: 78.4482,
    events: [
      ["Stand up special", "comedy", 28],
      ["Poetry slam", "theatre", 52],
      ["Free jam", "music", 76],
    ],
  },
  {
    name: "Far Arena",
    lat: 17.4666,
    lng: 78.4482,
    events: [
      ["Rock gig", "music", 32],
      ["Derby", "sports", 56],
    ],
  },
  {
    name: "Edge Club",
    lat: 17.5206,
    lng: 78.4482,
    events: [
      ["Late set", "nightlife", 34],
      ["Laugh riot", "comedy", 58],
    ],
  },
  // Two venues a few metres apart: their labels overlap once the map is zoomed in, so one of them has to be hidden.
  { name: "Twin Hall", lat: 17.38, lng: 78.4, events: [["Twin one, an evening with a very long title", "music", 36]] },
  { name: "Twin Lounge", lat: 17.38, lng: 78.4014, events: [["Twin two, another long title for the neighbour", "comedy", 37]] },
  // No point of its own: only its area is known, so it is listed and counted but has no marker (DESIGN.md, Approximate venue).
  { name: "Rough Cafe", area: "gachibowli", events: [["Open air film", "film", 40]] },
] as const;

/** Writes the fixture events, hours ahead of `now`. The browser tests pin `now` to NOW; `e2e/mobile-server.ts` passes the real clock so the events are upcoming. */
export function seed(file: string, now: Date = NOW): void {
  const hours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
  const db = new Database(file, { create: true, strict: true });
  migrate(db);
  const insert = db.prepare(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, venue_id, venue_name, category, is_free, price_min, source_url, content_hash,
       first_seen_at, last_seen_at, last_seen_run_id, updated_at) VALUES (?, ?, 's', ?, ?, ?, ?, ?, ?, ?, 'https://example.com/e', 'h', ?, ?, 'r', ?)`,
  );
  let n = 0;
  for (const v of VENUES) {
    const venueId = resolveVenueId(
      db,
      "lat" in v ? { name: v.name, area: "other", latitude: v.lat, longitude: v.lng } : { name: v.name, area: v.area },
    )!;
    for (const [title, category, h] of v.events) {
      n += 1;
      insert.run(
        `e${n}`,
        `e${n}`,
        title,
        hours(h),
        venueId,
        v.name,
        category,
        n % 3 === 0 ? 1 : 0,
        n % 3 === 1 ? 499 : null,
        hours(0),
        hours(0),
        hours(0),
      );
    }
  }
  // Covers and a host for the screenshot matrix: a landscape cover, a portrait poster and an organiser (fixtures.ts serves the images).
  db.prepare("UPDATE event SET image_url = ? WHERE id = 'e1'").run(`${IMAGE_HOST}/landscape.svg`);
  db.prepare("UPDATE event SET image_url = ? WHERE id = 'e4'").run(`${IMAGE_HOST}/portrait.svg`);
  db.prepare("UPDATE event SET organiser_name = 'Laugh Club' WHERE id = 'e2'").run();
  db.close();
}

if (import.meta.main) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydsocial-e2e-"));
  const file = path.join(dir, "fixture.sqlite");
  seed(file);
  await buildMapAssets();
  const db = new Database(file, { readonly: true, strict: true });
  // A go host and a contact address, so the event page shows its "Go with a group" link and the fallback page its testing line.
  const options = { appLinks: appLinksFromEnv({ APP_LINKS_HOST: GO_HOST }), supportEmail: "support@example.test" };
  const server = Bun.serve({ port: Number(process.env.E2E_PORT), fetch: (request) => siteResponse(db, request, () => NOW, options) });
  // The admin console on the same file, for the theme and screenshot specs.
  const admin = startAdmin({ dbPath: file, port: Number(process.env.E2E_ADMIN_PORT), env: {} });
  const stop = () => {
    server.stop(true);
    admin.server.stop(true);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  console.log(`e2e fixture on http://localhost:${server.port}, admin on http://127.0.0.1:${admin.server.port}`);
}
