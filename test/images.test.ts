import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { normalizeEvent, type RawEvent } from "../src/ingestion/sources/communitie.js";
import { httpsCover } from "../src/ingestion/sources/shared.js";
import { runSync } from "../src/ingestion/sync.js";
import { migrate } from "../src/migrate.js";
import { siteResponse } from "../src/web/index.js";
import type { MapCollection } from "../src/web/map/types.js";
import { communitieItems, memoryDb } from "./helpers.js";

test("httpsCover accepts only absolute https URLs", () => {
  expect(httpsCover(" https://a.example/x.jpg ")).toBe("https://a.example/x.jpg");
  for (const bad of [
    "http://a.example/x",
    "//a.example/x",
    "/x.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AA",
    "",
    null,
    undefined,
    5,
  ]) {
    expect(httpsCover(bad)).toBeNull();
  }
});

const raw = (over: Partial<RawEvent> = {}): RawEvent => ({
  id: "e1",
  slug: "show",
  title: "Show",
  status: "LIVE",
  approvalStatus: "APPROVED",
  categories: [{ slug: "music" }],
  minimumBasePrice: 100,
  timeSlots: [
    {
      venueName: "Hall",
      address: "Madhapur",
      latitude: 17.45,
      longitude: 78.39,
      scheduleSlots: [{ id: "s", slotDate: "2026-10-12", startTime: "19:00:00" }],
    },
  ],
  ...over,
});

test("Communitie prefers landscape, then preview, then portrait, and keeps the host", () => {
  const all = {
    landscapeImageUrl: "https://i.example/l.jpg",
    previewImageUrl: "https://i.example/p.jpg",
    portraitImageUrl: "https://i.example/v.jpg",
    hostName: " Laugh Club ",
  };
  expect(normalizeEvent(raw(all))[0]).toMatchObject({ imageUrl: "https://i.example/l.jpg", organiser: "Laugh Club" });
  expect(normalizeEvent(raw({ ...all, landscapeImageUrl: null }))[0]!.imageUrl).toBe("https://i.example/p.jpg");
  expect(normalizeEvent(raw({ portraitImageUrl: "https://i.example/v.jpg" }))[0]!.imageUrl).toBe("https://i.example/v.jpg");
  expect(normalizeEvent(raw({ landscapeImageUrl: "http://i.example/l.jpg" }))[0]).toMatchObject({ imageUrl: null, organiser: null });
});

test("a database from before image_url and organiser_name upgrades in place", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  db.exec("ALTER TABLE event DROP COLUMN image_url; ALTER TABLE event DROP COLUMN organiser_name;");
  migrate(db);
  const cols = (db.prepare("PRAGMA table_info(event)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toContain("image_url");
  expect(cols).toContain("organiser_name");
  db.close();
});

test("/api/map carries imageUrl, organiser and our own trust counts", async () => {
  const db = memoryDb();
  const now = new Date("2026-10-10T06:00:00Z");
  await runSync({
    db,
    now: () => now,
    fetchedBySource: communitieItems([raw({ landscapeImageUrl: "https://i.example/l.jpg", hostName: "Laugh Club" })]),
  });
  const map = (await siteResponse(db, new Request("http://localhost/api/map"), () => now).json()) as MapCollection;
  const feature = map.features[0]!;
  expect(feature.properties.events[0]).toMatchObject({
    imageUrl: "https://i.example/l.jpg",
    organiser: "Laugh Club",
    source: "communitie",
  });
  expect(feature.properties.trust).toEqual({ events: 1, sources: 1 });
  expect(map.organisers["Laugh Club"]).toEqual({ events: 1, sources: 1 });
  db.close();
});
