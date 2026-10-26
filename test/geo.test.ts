import { expect, test } from "bun:test";
import { AREA_CENTRES, AREAS, nearestArea } from "../src/catalog/area.js";
import { backfillVenueLocations, inHyderabad, isUsablePoint, resolveVenueId, writeVenueLocation } from "../src/catalog/venue.js";
import { memoryDb } from "./helpers.js";

const venue = (db: ReturnType<typeof memoryDb>, id: string) =>
  db.prepare("SELECT * FROM venue WHERE id = ?").get(id) as Record<string, unknown>;

test("inHyderabad accepts the city and rejects other places", () => {
  expect(inHyderabad(17.4165, 78.4392)).toBe(true);
  expect(inHyderabad(17.26, 78.39)).toBe(true); // Shamshabad
  expect(inHyderabad(17.6247, 78.0867)).toBe(true); // Sangareddy
  expect(inHyderabad(12.97, 77.59)).toBe(false); // Bengaluru
  expect(inHyderabad(0, 0)).toBe(false);
  expect(inHyderabad(78.4, 17.4)).toBe(false); // swapped
});

test("the city-centre placeholder is not a usable point, a nearby real one is", () => {
  expect(isUsablePoint(17.385, 78.4867)).toBe(false);
  expect(isUsablePoint(17.3852, 78.4869)).toBe(false); // about 30 m away
  expect(isUsablePoint(17.39, 78.4867)).toBe(true); // about 550 m away
  expect(isUsablePoint(null, 78.4)).toBe(false);
  expect(isUsablePoint(Number.NaN, 78.4)).toBe(false);
});

test("every area but other has a centre inside the box", () => {
  for (const area of AREAS) {
    if (area === "other") continue;
    expect(AREA_CENTRES[area]).toBeDefined();
    expect(inHyderabad(AREA_CENTRES[area].lat, AREA_CENTRES[area].lng)).toBe(true);
  }
});

test("a source point is copied to the venue only when usable", () => {
  const db = memoryDb();
  const good = resolveVenueId(db, { name: "Good Hall", area: "other", latitude: 17.4165, longitude: 78.4392 })!;
  expect(venue(db, good)).toMatchObject({ lat: 17.4165, geocode_state: "resolved", geocode_source: "source" });

  const placeholder = resolveVenueId(db, { name: "Centre Hall", area: "other", latitude: 17.385, longitude: 78.4867 })!;
  expect(venue(db, placeholder)).toMatchObject({ lat: null, lng: null, geocode_state: "pending", geocode_source: null });

  const abroad = resolveVenueId(db, { name: "Abroad Hall", area: "other", latitude: 12.97, longitude: 77.59 })!;
  expect(venue(db, abroad)).toMatchObject({ lat: null, geocode_state: "pending" });
  db.close();
});

test("a venue with a known area and no point sits at the area centre as approximate", () => {
  const db = memoryDb();
  const id = resolveVenueId(db, { name: "Somewhere Cafe", area: "gachibowli", latitude: 17.385, longitude: 78.4867 })!;
  expect(venue(db, id)).toMatchObject({
    lat: AREA_CENTRES.gachibowli.lat,
    lng: AREA_CENTRES.gachibowli.lng,
    geocode_state: "approximate",
    geocode_source: "area",
  });
  // A later real point upgrades it to exact.
  resolveVenueId(db, { name: "Somewhere Cafe", area: "gachibowli", latitude: 17.44, longitude: 78.35 });
  expect(venue(db, id)).toMatchObject({ lat: 17.44, geocode_state: "resolved", geocode_source: "source" });
  db.close();
});

test("a venue with a real point and area other takes the nearest area", () => {
  expect(nearestArea(17.4486, 78.3908)).toBe("madhapur");
  expect(nearestArea(17.6, 78.6)).toBe("other"); // beyond the snap radius of any centre

  const db = memoryDb();
  const id = resolveVenueId(db, { name: "Unnamed Studio", area: "other", latitude: 17.4487, longitude: 78.3909 })!;
  expect(venue(db, id).area).toBe("madhapur");
  db.close();
});

test("backfill sends stored bad points back to pending, snaps other venues, and events follow", () => {
  const db = memoryDb();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO venue (id, name, name_key, area, lat, lng, geocode_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'resolved', ?, ?)`,
  );
  insert.run("far", "Far", "far", "other", 12.97, 77.59, now, now);
  insert.run("mid", "Mid", "mid", "other", 17.385, 78.4867, now, now);
  insert.run("snap", "Snap", "snap", "other", 17.4487, 78.3909, now, now);
  insert.run("area", "Area", "area", "uppal", 17.385, 78.4867, now, now);
  db.prepare(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, venue_id, source_url, content_hash, first_seen_at, last_seen_at, last_seen_run_id, updated_at)
     VALUES ('e1', 's', 's', 't', ?, 'snap', 'u', 'h', ?, ?, 'r', ?)`,
  ).run(now, now, now, now);
  backfillVenueLocations(db);
  expect(venue(db, "far")).toMatchObject({ lat: null, geocode_state: "pending" });
  expect(venue(db, "mid")).toMatchObject({ lat: null, geocode_state: "pending" });
  expect(venue(db, "snap")).toMatchObject({ area: "madhapur", geocode_state: "resolved", geocode_source: "source" });
  expect(venue(db, "area")).toMatchObject({ geocode_state: "approximate", geocode_source: "area" });
  expect((db.prepare("SELECT area FROM event WHERE id = 'e1'").get() as { area: string }).area).toBe("madhapur");
  db.close();
});

test("automation never overwrites a manual venue", () => {
  const db = memoryDb();
  const id = resolveVenueId(db, { name: "Pinned Place", area: "other", latitude: 17.4165, longitude: 78.4392 })!;
  expect(writeVenueLocation(db, id, { lat: 17.42, lng: 78.44, state: "manual", source: "manual" }, undefined, { manual: true })).toBe(true);

  resolveVenueId(db, { name: "Pinned Place", area: "other", latitude: 17.5, longitude: 78.5 });
  expect(writeVenueLocation(db, id, { lat: 17.6, lng: 78.6, state: "resolved", source: "nominatim" })).toBe(false);
  backfillVenueLocations(db);
  expect(venue(db, id)).toMatchObject({ lat: 17.42, lng: 78.44, geocode_state: "manual" });
  db.close();
});

test("geocode_state is enforced by the writer and by the trigger", () => {
  const db = memoryDb();
  const id = resolveVenueId(db, { name: "Strict Hall", area: "other" })!;
  expect(writeVenueLocation(db, id, { lat: 17.4, lng: 78.4, state: "bogus" as never, source: "nominatim" })).toBe(false);
  expect(writeVenueLocation(db, id, { lat: 12.97, lng: 77.59, state: "resolved", source: "nominatim" })).toBe(false);
  expect(writeVenueLocation(db, id, { lat: 17.4, lng: 78.4, state: "resolved", source: "nominatim" })).toBe(true);
  // Any other writer is stopped by the trigger.
  expect(() => db.prepare("UPDATE venue SET geocode_state = 'done' WHERE id = ?").run(id)).toThrow();
  expect(() => db.prepare("UPDATE venue SET geocode_source = 'guess' WHERE id = ?").run(id)).toThrow();
  db.close();
});
