import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { checkSourceHealth, median } from "../src/ingestion/health.js";
import type { FetchedItem } from "../src/ingestion/sources/types.js";
import { runSync } from "../src/ingestion/sync.js";
import { migrate } from "../src/migrate.js";
import { memoryDb } from "./helpers.js";

test("median handles odd and even lengths and ignores input order", () => {
  expect(median([])).toBe(0);
  expect(median([5, 1, 3])).toBe(3);
  expect(median([4, 1, 3, 2])).toBe(2.5);
});

test("a source with no history is trusted", () => {
  expect(checkSourceHealth(0, []).healthy).toBe(true);
});

test("a source whose median is tiny is left alone", () => {
  expect(checkSourceHealth(0, [1, 2, 1]).healthy).toBe(true);
});

test("a source that goes silent against a healthy median is unhealthy", () => {
  const verdict = checkSourceHealth(0, [40, 41, 39]);
  expect(verdict.healthy).toBe(false);
  expect(verdict.reason).toContain("0 occurrences");
});

test("a source that collapses below half its median is unhealthy", () => {
  expect(checkSourceHealth(19, [40, 41, 39]).healthy).toBe(false);
  expect(checkSourceHealth(20, [40, 41, 39]).healthy).toBe(true);
});

test("normal week-to-week movement is not flagged", () => {
  expect(checkSourceHealth(35, [40, 41, 39]).healthy).toBe(true);
  expect(checkSourceHealth(90, [40, 41, 39]).healthy).toBe(true);
});

const items = (count: number, tag: string): FetchedItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${tag}-${i}`,
    raw: { id: `${tag}-${i}` },
    occurrences: [
      {
        sourceEventId: `${tag}-${i}`,
        sourceSlotId: "s1",
        slug: `${tag}-${i}`,
        title: `Event ${tag} ${i}`,
        description: null,
        timeKind: "timed" as const,
        startsAt: new Date(Date.UTC(2026, 10, 1 + i, 12)).toISOString(),
        endsAt: null,
        venueName: `Venue ${i}`,
        address: null,
        latitude: null,
        longitude: null,
        categories: [],
        tags: [],
        priceMin: null,
        isFree: true,
        sourceUrl: `https://example.test/${tag}-${i}`,
      },
    ],
  }));

test("a source whose parser silently returns nothing keeps its events", async () => {
  const db = memoryDb();
  const active = () => (db.prepare("SELECT COUNT(*) c FROM event WHERE source='district' AND status='active'").get() as { c: number }).c;

  for (let run = 0; run < 3; run += 1) {
    await runSync({ db, fetchedBySource: { district: items(40, "d"), luma: items(5, "l") } });
  }
  expect(active()).toBe(40);

  // Two consecutive empty runs is what used to delist the whole source.
  await runSync({ db, fetchedBySource: { district: [], luma: items(5, "l") } });
  const result = await runSync({ db, fetchedBySource: { district: [], luma: items(5, "l") } });

  expect(active()).toBe(40);
  expect(Object.keys(result.unhealthySources)).toEqual(["district"]);
  expect((db.prepare("SELECT COUNT(*) c FROM event WHERE source='luma' AND status='active'").get() as { c: number }).c).toBe(5);
  db.close();
});

test("a healthy source still delists an event that genuinely disappeared", async () => {
  const db = memoryDb();
  for (let run = 0; run < 2; run += 1) await runSync({ db, fetchedBySource: { district: items(40, "d") } });
  expect((db.prepare("SELECT COUNT(*) c FROM event WHERE status='active'").get() as { c: number }).c).toBe(40);

  // 39 of 40 is well inside the band, so the run stays healthy and reconciles.
  await runSync({ db, fetchedBySource: { district: items(39, "d") } });
  await runSync({ db, fetchedBySource: { district: items(39, "d") } });

  expect((db.prepare("SELECT COUNT(*) c FROM event WHERE status='delisted'").get() as { c: number }).c).toBe(1);
  db.close();
});

test("an unchanged record is not re-archived and does not move updated_at", async () => {
  const db = memoryDb();
  const payloads = () => (db.prepare("SELECT COUNT(*) c FROM raw_payload").get() as { c: number }).c;
  const updatedAt = () =>
    (db.prepare("SELECT updated_at FROM event WHERE source_event_id = 'd-0'").get() as { updated_at: string }).updated_at;

  for (let run = 0; run < 5; run += 1) await runSync({ db, fetchedBySource: { district: items(20, "d") } });
  expect(payloads()).toBe(20);

  const before = updatedAt();
  await runSync({ db, fetchedBySource: { district: items(20, "d") }, now: () => new Date("2027-06-01T00:00:00Z") });
  expect(updatedAt()).toBe(before);
  expect(payloads()).toBe(20);
  db.close();
});

test("a changed record is archived again and moves updated_at", async () => {
  const db = memoryDb();
  // Pin the clock: two runs inside the same millisecond would stamp the same
  // updated_at whether or not the content changed, so the check would pass by
  // accident in one direction and fail by accident in the other.
  await runSync({ db, fetchedBySource: { district: items(3, "d") }, now: () => new Date("2026-01-01T00:00:00Z") });
  const before = (db.prepare("SELECT updated_at FROM event WHERE source_event_id = 'd-0'").get() as { updated_at: string }).updated_at;

  const revised = items(3, "d");
  revised[0]!.raw = { id: "d-0", note: "changed upstream" };
  await runSync({ db, fetchedBySource: { district: revised }, now: () => new Date("2026-01-02T00:00:00Z") });

  expect((db.prepare("SELECT COUNT(*) c FROM raw_payload WHERE source_event_id = 'd-0'").get() as { c: number }).c).toBe(2);
  expect((db.prepare("SELECT updated_at FROM event WHERE source_event_id = 'd-0'").get() as { updated_at: string }).updated_at).not.toBe(
    before,
  );
  db.close();
});

test("retention keeps the newest payload for a record even past the cutoff", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: items(2, "d") }, now: () => new Date("2026-01-01T00:00:00Z") });
  expect((db.prepare("SELECT COUNT(*) c FROM raw_payload").get() as { c: number }).c).toBe(2);

  // A year later the only copy of each record is far past the 30-day cutoff.
  await runSync({ db, fetchedBySource: { district: items(2, "d") }, now: () => new Date("2027-01-01T00:00:00Z") });
  expect((db.prepare("SELECT COUNT(*) c FROM raw_payload").get() as { c: number }).c).toBe(2);
  db.close();
});

test("closes out a run that was killed while still marked running", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { district: items(2, "d") }, now: () => new Date("2026-01-01T00:00:00Z") });
  db.prepare("INSERT INTO sync_run (id, started_at, status) VALUES ('killed', '2026-01-01T00:00:00Z', 'running')").run();

  await runSync({ db, fetchedBySource: { district: items(2, "d") }, now: () => new Date("2026-01-02T00:00:00Z") });
  expect((db.prepare("SELECT status FROM sync_run WHERE id = 'killed'").get() as { status: string }).status).toBe("abandoned");
  db.close();
});

test("leaves a recently started run alone", async () => {
  const db = memoryDb();
  migrate(db);
  db.prepare("INSERT INTO sync_run (id, started_at, status) VALUES ('inflight', '2026-01-01T11:30:00Z', 'running')").run();
  await runSync({ db, fetchedBySource: { district: items(2, "d") }, now: () => new Date("2026-01-01T12:00:00Z") });
  expect((db.prepare("SELECT status FROM sync_run WHERE id = 'inflight'").get() as { status: string }).status).toBe("running");
  db.close();
});

test("raw archive identity and retention are scoped by source", async () => {
  const db = memoryDb();
  const fetchedBySource = { district: items(1, "same"), luma: items(1, "same") };
  await runSync({ db, fetchedBySource, now: () => new Date("2026-01-01T00:00:00Z") });
  expect(db.query("SELECT COUNT(*) AS n FROM raw_payload").get()).toEqual({ n: 2 });
  await runSync({ db, fetchedBySource, now: () => new Date("2027-01-01T00:00:00Z") });
  expect(db.query("SELECT source FROM raw_payload ORDER BY source").all()).toEqual([{ source: "district" }, { source: "luma" }]);
  db.close();
});

test("raw archive migration preserves old data and leaves ambiguous sources unknown", () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE raw_payload (id TEXT PRIMARY KEY, sync_run_id TEXT NOT NULL, source_event_id TEXT NOT NULL, fetched_at TEXT NOT NULL, body TEXT NOT NULL, content_hash TEXT NOT NULL);
    INSERT INTO raw_payload VALUES ('old', 'old-run', 'same', '2026-01-01', '{}', 'hash');`);
  migrate(db);
  migrate(db);
  expect(db.query("SELECT source, body FROM raw_payload").get()).toEqual({ source: null, body: "{}" });
  db.close();
});

test("raw archive migration attributes only historical single-source runs", () => {
  const db = memoryDb();
  db.exec(`INSERT INTO sync_run (id, started_at) VALUES ('single', '2026-01-01'), ('multi', '2026-01-02');
    INSERT INTO sync_run_source (sync_run_id, source, status) VALUES ('single', 'district', 'ok'), ('multi', 'district', 'ok'), ('multi', 'luma', 'ok');
    INSERT INTO raw_payload VALUES ('one', 'single', 'district', 'same', '2026-01-01', '{}', 'h'), ('two', 'multi', 'district', 'same', '2026-01-02', '{}', 'h');
    DROP INDEX idx_raw_payload_identity;
    ALTER TABLE raw_payload DROP COLUMN source;`);
  migrate(db);
  expect(db.query("SELECT id, source FROM raw_payload ORDER BY id").all()).toEqual([
    { id: "one", source: "district" },
    { id: "two", source: null },
  ]);
  db.close();
});
