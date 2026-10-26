import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { RawEvent } from "../src/ingestion/sources/communitie.js";
import type { SourceAdapter } from "../src/ingestion/sources/types.js";
import { runSync, selectAdapters } from "../src/ingestion/sync.js";
import { migrate } from "../src/migrate.js";
import { communitieItems, memoryDb } from "./helpers.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");

function loadFixture(name: string): RawEvent[] {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8")) as RawEvent[];
}

function openDb(): Database {
  return memoryDb();
}

test("migration backfills venue IDs from existing venue names", async () => {
  const db = openDb();
  await runSync({
    db,
    fetchedBySource: {
      communitie: [
        { id: "one", raw: { id: "one" }, occurrences: [occurrenceForVenueBackfill("one", "Lamakaan")] },
        { id: "two", raw: { id: "two" }, occurrences: [occurrenceForVenueBackfill("two", "Lamakaan")] },
      ],
    },
  });
  db.prepare("UPDATE event SET venue_id = NULL").run();
  db.prepare("DELETE FROM venue").run();

  migrate(db);

  const rows = db.prepare("SELECT venue_id AS venueId FROM event ORDER BY source_event_id").all() as { venueId: string }[];
  expect(rows[0]!.venueId).toBeTruthy();
  expect(rows[0]!.venueId).toBe(rows[1]!.venueId);
  expect(db.prepare("SELECT COUNT(*) AS count FROM venue").get()).toEqual({ count: 1 });
  db.close();
});

function occurrenceForVenueBackfill(sourceEventId: string, venueName: string): import("../src/catalog/types.js").Occurrence {
  return {
    sourceEventId,
    sourceSlotId: "slot",
    slug: sourceEventId,
    title: sourceEventId,
    description: null,
    timeKind: "timed" as const,
    startsAt: "2026-09-12T13:30:00.000Z",
    endsAt: null,
    venueName,
    address: null,
    latitude: null,
    longitude: null,
    categories: ["comedy"],
    tags: [],
    priceMin: 0,
    isFree: true,
    sourceUrl: `https://example.com/${sourceEventId}`,
  };
}

function activeEvents(db: Database) {
  return db.prepare("SELECT * FROM event WHERE status = 'active' ORDER BY starts_at, source_event_id").all() as Record<string, unknown>[];
}

test("a first sync creates one row per occurrence and skips unapproved events", async () => {
  const db = openDb();
  const result = await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-1.json")) });

  expect(result.created).toBe(5);
  expect(result.updated).toBe(0);
  expect(activeEvents(db).length).toBe(5);
  db.close();
});

test("re-running with the same payload is idempotent: no new rows, no false updates counted as creates", async () => {
  const db = openDb();
  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-1.json")) });
  const second = await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-1.json")) });

  expect(second.created).toBe(0);
  expect(second.updated).toBe(5);
  expect(activeEvents(db).length).toBe(5);
  db.close();
});

test("a changed field is reflected without creating a duplicate row", async () => {
  const db = openDb();
  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-1.json")) });
  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-2.json")) });

  const boulderJam = db
    .prepare("SELECT price_min AS priceMin FROM event WHERE source_event_id = ? AND source_slot_id = ?")
    .get("6767a79f-3c9a-4cfb-8434-930cf88fdf95", "74a6903c-c933-46cd-8b05-0439233ecb61") as { priceMin: number };
  expect(boulderJam.priceMin).toBe(750);
  db.close();
});

test("events missing for one run get a strike but stay active; missing for two runs get delisted", async () => {
  const db = openDb();
  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-1.json")) });
  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-2.json")) });
  const afterSecondRun = db
    .prepare("SELECT status, missed_runs FROM event WHERE source_event_id = ?")
    .get("90a734a9-898a-43ab-8312-6eaa908d339c") as { status: string; missed_runs: number };
  expect(afterSecondRun.status).toBe("active");
  expect(afterSecondRun.missed_runs).toBe(1);

  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-3.json")) });
  const afterThirdRun = db.prepare("SELECT status FROM event WHERE source_event_id = ?").get("90a734a9-898a-43ab-8312-6eaa908d339c") as {
    status: string;
  };
  expect(afterThirdRun.status).toBe("delisted");

  const quizNight = db.prepare("SELECT status, missed_runs FROM event WHERE source_event_id = ?").get("unrelated-event-same-night") as {
    status: string;
    missed_runs: number;
  };
  expect(quizNight.status).toBe("active");
  expect(quizNight.missed_runs).toBe(1);

  const total = db.prepare("SELECT COUNT(*) AS count FROM event").get() as { count: number };
  expect(total.count).toBe(5);
  db.close();
});

test("the fuzzy dedupe pass groups the same real event across two sources under one canonical row", async () => {
  // Same-source near-duplicates must stay separate (primary key / never second-guess
  // one source). Cross-source fuzzy match is what this pass is for: 90-min window,
  // venue + title similarity, earliest first_seen becomes canonical (data-model.md 8).
  const db = openDb();
  const occurrence = (
    overrides: Partial<Omit<import("../src/catalog/types.js").Occurrence, "timeKind">> = {},
  ): import("../src/catalog/types.js").Occurrence => ({
    sourceEventId: "evt-a",
    sourceSlotId: "slot-a",
    slug: "open-mic-lamakaan",
    title: "Open Mic at Lamakaan",
    description: null,
    timeKind: "timed" as const,
    startsAt: "2026-09-12T13:30:00.000Z",
    endsAt: null,
    venueName: "Lamakaan",
    address: null,
    latitude: null,
    longitude: null,
    categories: ["comedy"],
    tags: [],
    priceMin: 0,
    isFree: true,
    sourceUrl: "https://example.com/a",
    ...overrides,
  });

  await runSync({
    db,
    fetchedBySource: {
      communitie: [
        {
          id: "evt-a",
          raw: { id: "evt-a" },
          occurrences: [occurrence()],
        },
      ],
      allevents: [
        {
          id: "evt-b",
          raw: { id: "evt-b" },
          occurrences: [
            occurrence({
              sourceEventId: "evt-b",
              sourceSlotId: "slot-b",
              slug: "open-mic-night-lamakaan",
              title: "Open Mic Night at Lamakaan Hyderabad",
              startsAt: "2026-09-12T14:00:00.000Z",
              venueName: "Lamakaan: Hyderabad",
              sourceUrl: "https://example.com/b",
            }),
          ],
        },
      ],
    },
  });

  const first = db
    .prepare("SELECT id, dedupe_group_id AS groupId, is_canonical AS isCanonical FROM event WHERE source = ?")
    .get("communitie") as { id: string; groupId: string; isCanonical: number };
  const second = db
    .prepare("SELECT dedupe_group_id AS groupId, is_canonical AS isCanonical FROM event WHERE source = ?")
    .get("allevents") as { groupId: string; isCanonical: number };

  expect(first.isCanonical).toBe(1);
  expect(second.isCanonical).toBe(0);
  expect(first.groupId).toBe(second.groupId);
  expect(first.groupId).toBe(first.id);
  db.close();
});

test("the fuzzy dedupe pass also groups a same-source resubmit under one canonical row", async () => {
  const db = openDb();
  await runSync({ db, fetchedBySource: communitieItems(loadFixture("events-page-1.json")) });

  const merakee = db
    .prepare("SELECT id, dedupe_group_id AS groupId, is_canonical AS isCanonical FROM event WHERE source_event_id = ?")
    .get("90a734a9-898a-43ab-8312-6eaa908d339c") as { id: string; groupId: string; isCanonical: number };
  const duplicate = db
    .prepare("SELECT dedupe_group_id AS groupId, is_canonical AS isCanonical FROM event WHERE source_event_id = ?")
    .get("duplicate-listing-id-0000") as { groupId: string; isCanonical: number };

  expect(merakee.isCanonical).toBe(1);
  expect(duplicate.isCanonical).toBe(0);
  expect(merakee.groupId).toBe(duplicate.groupId);
  expect(merakee.groupId).toBe(merakee.id);
  db.close();
});

describe("selectAdapters", () => {
  const adapter = (name: string, optIn?: boolean): SourceAdapter => ({ name, optIn, fetch: async () => [] });
  const all = [adapter("communitie"), adapter("luma"), adapter("agent:grok", true)];

  test("a default sync skips opt-in sources", () => {
    expect(selectAdapters(all).map((a) => a.name)).toEqual(["communitie", "luma"]);
  });

  test("a named opt-in source runs", () => {
    expect(selectAdapters(all, ["agent:grok"]).map((a) => a.name)).toEqual(["agent:grok"]);
  });
});

test("a caller-supplied runId names the sync_run row", async () => {
  const db = openDb();
  const runId = "11111111-2222-4333-8444-555555555555";
  const result = await runSync({ db, runId, fetchedBySource: {} });
  expect(result.runId).toBe(runId);
  expect((db.prepare("SELECT status FROM sync_run WHERE id = ?").get(runId) as { status: string }).status).toBe("success");
  db.close();
});
