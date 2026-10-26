import { expect, test } from "bun:test";
import { resolveVenueId } from "../src/catalog/venue.js";
import type { Geocoder } from "../src/ingestion/geocode/geocoder.js";
import { nominatimGeocoder } from "../src/ingestion/geocode/nominatim.js";
import { runGeocode } from "../src/ingestion/geocode/runGeocode.js";
import { memoryDb } from "./helpers.js";

const stub = (points: Record<string, { lat: number; lng: number } | null>): Geocoder => ({
  name: "nominatim",
  geocode: async (query) => Object.entries(points).find(([name]) => query.startsWith(name))?.[1] ?? null,
});
const state = (db: ReturnType<typeof memoryDb>, name: string) =>
  db.prepare("SELECT lat, geocode_state AS state, geocode_source AS source FROM venue WHERE name = ?").get(name) as {
    lat: number | null;
    state: string;
    source: string | null;
  };

function seed() {
  const db = memoryDb();
  resolveVenueId(db, { name: "Lost Place", area: "other" }); // pending
  resolveVenueId(db, { name: "Found Place", area: "other" }); // pending
  resolveVenueId(db, { name: "Rough Place", area: "uppal" }); // approximate
  resolveVenueId(db, { name: "Elsewhere", area: "other" }); // pending, provider answers outside Hyderabad
  resolveVenueId(db, { name: "Exact Place", area: "other", latitude: 17.41, longitude: 78.45 }); // resolved, untouched
  return db;
}
const geocoder = stub({
  "Found Place": { lat: 17.42, lng: 78.44 },
  "Rough Place": { lat: 17.405, lng: 78.56 },
  Elsewhere: { lat: 12.97, lng: 77.59 },
});

test("geocode resolves pending and approximate venues and fails the rest", async () => {
  const db = seed();
  const result = await runGeocode({ db, geocoders: [geocoder] });
  expect(result).toMatchObject({ considered: 4, resolved: 2, failed: 2 });
  expect(state(db, "Found Place")).toMatchObject({ state: "resolved", source: "nominatim", lat: 17.42 });
  expect(state(db, "Rough Place")).toMatchObject({ state: "resolved", source: "nominatim" });
  expect(state(db, "Lost Place").state).toBe("failed");
  expect(state(db, "Elsewhere").state).toBe("failed"); // out-of-box answer rejected
  expect(state(db, "Exact Place")).toMatchObject({ state: "resolved", source: "source" });
  db.close();
});

test("an approximate venue no provider improves stays approximate", async () => {
  const db = seed();
  await runGeocode({ db, geocoders: [stub({})] });
  expect(state(db, "Rough Place").state).toBe("approximate");
  db.close();
});

test("dry run writes nothing, and a manual venue is never touched", async () => {
  const db = seed();
  const dry = await runGeocode({ db, geocoders: [geocoder], dryRun: true });
  expect(dry.resolved).toBe(2);
  expect(state(db, "Found Place").state).toBe("pending");

  db.prepare("UPDATE venue SET geocode_state = 'manual', lat = 17.5, lng = 78.5 WHERE name = 'Found Place'").run();
  await runGeocode({ db, geocoders: [geocoder] });
  expect(state(db, "Found Place")).toMatchObject({ state: "manual", lat: 17.5 });
  db.close();
});

test("nominatim scopes the query to Hyderabad, caches, and sends our user agent", async () => {
  const urls: string[] = [];
  const geo = nominatimGeocoder({
    minIntervalMs: 0,
    fetchImpl: async (url, init) => {
      urls.push(url);
      expect((init.headers as Record<string, string>)["user-agent"]).toContain("hydsocial");
      return Response.json([{ lat: "17.4", lon: "78.4", place_id: 7 }]);
    },
  });
  expect(await geo.geocode("Lamakaan, Hyderabad")).toEqual({ lat: 17.4, lng: 78.4, placeId: "7" });
  await geo.geocode("lamakaan, hyderabad");
  expect(urls.length).toBe(1);
  const params = new URL(urls[0]!).searchParams;
  expect(params.get("bounded")).toBe("1");
  expect(params.get("countrycodes")).toBe("in");
  expect(params.get("viewbox")).toBe("78,17.7,78.7,17.2");
});
