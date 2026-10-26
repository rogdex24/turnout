import { expect, test } from "bun:test";
import { resolveVenueId } from "../src/catalog/venue.js";
import { addMuteRule } from "../src/curation/mute.js";
import { siteResponse } from "../src/web/index.js";
import type { MapCollection } from "../src/web/map/types.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-10-10T06:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

function seed() {
  const db = memoryDb();
  const exact = resolveVenueId(db, { name: "Exact Hall", area: "other", latitude: 17.4165, longitude: 78.4392 })!;
  const rough = resolveVenueId(db, { name: "Rough Hall", area: "gachibowli" })!;
  const nowhere = resolveVenueId(db, { name: "Nowhere Hall", area: "other" })!;
  const insert = db.prepare(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, venue_id, venue_name, category, status, is_canonical,
       source_url, content_hash, first_seen_at, last_seen_at, last_seen_run_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'comedy', ?, ?, 'u', 'h', ?, ?, 'r', ?)`,
  );
  const add = (
    id: string,
    venueId: string,
    venueName: string,
    startsAt: string,
    opts: { status?: string; canonical?: number; run?: string } = {},
  ) =>
    insert.run(
      id,
      opts.run ?? id,
      `slot-${id}`,
      `Title ${id}`,
      startsAt,
      venueId,
      venueName,
      opts.status ?? "active",
      opts.canonical ?? 1,
      at(0),
      at(0),
      at(0),
    );
  add("a", exact, "Exact Hall", at(1));
  add("b", rough, "Rough Hall", at(2));
  add("run1", exact, "Exact Hall", at(2), { run: "run" });
  add("run2", exact, "Exact Hall", at(3), { run: "run" });
  add("lost", nowhere, "Nowhere Hall", at(1));
  add("late", exact, "Exact Hall", at(20));
  add("gone", exact, "Exact Hall", at(1), { status: "delisted" });
  add("dup", exact, "Exact Hall", at(1), { canonical: 0 });
  add("muted", exact, "Exact Hall", at(1), { run: "muted" });
  db.prepare("UPDATE event SET title = 'Muted show' WHERE id = 'muted'").run();
  addMuteRule(db, "title", "Muted show");
  return db;
}

const get = async (db: ReturnType<typeof memoryDb>, path = "/api/map") =>
  (await siteResponse(db, new Request(`http://localhost${path}`), () => NOW).json()) as MapCollection;

test("the map lists venues with listed events in the window and flags approximate ones", async () => {
  const db = seed();
  const map = await get(db);
  const byName = Object.fromEntries(map.features.map((f) => [f.properties.name, f]));
  expect(Object.keys(byName).sort()).toEqual(["Exact Hall", "Rough Hall"]);
  expect(byName["Exact Hall"]!.properties.precision).toBe("exact");
  expect(byName["Exact Hall"]!.geometry.coordinates).toEqual([78.4392, 17.4165]);
  expect(byName["Rough Hall"]!.properties.precision).toBe("approximate");
  expect(byName["Rough Hall"]!.properties.area).toBe("gachibowli");
  db.close();
});

test("muted, duplicate, delisted and out-of-window events never appear", async () => {
  const db = seed();
  const ids = (await get(db)).features.flatMap((f) => f.properties.events.map((e) => e.id));
  expect(ids.sort()).toEqual(["a", "b", "run1"]);
  const wide = (await get(db, "/api/map?from=2026-10-10&to=2026-11-30")).features.flatMap((f) => f.properties.events.map((e) => e.id));
  expect(wide).toContain("late");
  expect(wide).not.toContain("muted");
  db.close();
});

test("a multi-date run collapses to its first date and the response counts unplaced events", async () => {
  const db = seed();
  const map = await get(db);
  const exact = map.features.find((f) => f.properties.name === "Exact Hall")!;
  expect(exact.properties.events.find((e) => e.id === "run1")!.moreDates).toBe(1);
  expect(map.excludedNoLocation).toBe(1);
  db.close();
});

test("a bad date is a 400", async () => {
  const db = seed();
  const res = siteResponse(db, new Request("http://localhost/api/map?from=tomorrow"), () => NOW);
  expect(res.status).toBe(400);
  db.close();
});

test("a venue whose stored point is outside Hyderabad is left out, not shown", async () => {
  const db = seed();
  db.prepare("UPDATE venue SET lat = 12.97, lng = 77.59 WHERE name = 'Exact Hall'").run();
  const map = await get(db);
  expect(map.features.map((f) => f.properties.name)).toEqual(["Rough Hall"]);
  expect(map.excludedNoLocation).toBe(3);
  db.close();
});
