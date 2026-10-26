import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMute, deleteMute, getEvent, getRun, HttpError, listEvents, listMutes, listRuns, listSources } from "../src/admin/api.js";
import { SOURCE_ADAPTERS } from "../src/ingestion/sources/registry.js";
import { seedAdmin } from "./adminHelpers.js";
import { memoryDb } from "./helpers.js";

const q = (query = "") => new URLSearchParams(query);
const status = (fn: () => unknown): number | "ok" => {
  try {
    fn();
    return "ok";
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
};

test("listEvents carries listed and hiddenReasons and filters on visibility", async () => {
  const db = await seedAdmin();
  const all = listEvents(db, q());
  expect(all.total).toBe(6);
  const byTitle = Object.fromEntries(all.events.map((e) => [e.title, e]));
  expect(byTitle["Standup Night"]!.listed).toBe(true);
  expect(byTitle["Standup Night"]!.hiddenReasons).toEqual([]);
  expect(byTitle["Mystery Show"]!.hiddenReasons).toEqual(["no venue"]);

  const hidden = listEvents(db, q("visibility=hidden"));
  expect(hidden.events.every((e) => !e.listed && e.hiddenReasons.length > 0)).toBe(true);
  expect(hidden.total).toBe(4);
  expect(
    listEvents(db, q("visibility=listed"))
      .events.map((e) => e.title)
      .sort(),
  ).toEqual(["Standup Night", "Twin Concert"]);
  db.close();
});

test("listEvents filters by source, status, category, area, dates and text, and pages", async () => {
  const db = await seedAdmin();
  expect(listEvents(db, q("source=district")).total).toBe(1);
  expect(listEvents(db, q("category=comedy")).events.map((e) => e.title)).toEqual(["Standup Night"]);
  expect(listEvents(db, q("area=other")).total).toBe(6);
  expect(listEvents(db, q("area=madhapur")).total).toBe(0);
  expect(listEvents(db, q("q=PHOENIX")).total).toBe(1); // venue substring, case-insensitive
  expect(listEvents(db, q("q=twin")).total).toBe(2);
  expect(listEvents(db, q("q=%25")).total).toBe(0); // LIKE wildcards are literal
  // 2026-09-13T13:30Z is 19:00 IST on the 13th; the twins are on the 20th.
  expect(listEvents(db, q("from=2026-09-13&to=2026-09-13")).total).toBe(4);
  expect(listEvents(db, q("from=2026-09-14")).total).toBe(2);
  db.prepare("UPDATE event SET status = 'delisted' WHERE source_event_id = 'listed'").run();
  expect(listEvents(db, q("status=delisted")).events.map((e) => e.hiddenReasons)).toEqual([["delisted"]]);
  expect(listEvents(db, q("status=active")).total).toBe(5);

  const page = listEvents(db, q("pageSize=2&page=3"));
  expect(page.events).toHaveLength(2);
  expect(listEvents(db, q("pageSize=2&page=4")).events).toHaveLength(0);
  db.close();
});

test("listEvents rejects bad parameters with 400", () => {
  const db = memoryDb();
  for (const bad of [
    "status=gone",
    "visibility=maybe",
    "page=0",
    "page=x",
    "pageSize=201",
    "pageSize=0",
    "pageSize=1.5",
    "from=yesterday",
    "to=2026-02-31",
    "from=2026-9-1",
    `q=${"x".repeat(201)}`,
  ]) {
    expect({ bad, result: status(() => listEvents(db, q(bad))) }).toEqual({ bad, result: 400 });
  }
  expect(status(() => listEvents(db, q("pageSize=200")))).toBe("ok");
});

test("getEvent returns reasons, the dedupe group and the newest raw payload", async () => {
  const db = await seedAdmin();
  const id = (sourceEventId: string) =>
    (db.prepare("SELECT id FROM event WHERE source_event_id = ?").get(sourceEventId) as { id: string }).id;

  const listed = getEvent(db, id("listed"));
  expect(listed.listed).toBe(true);
  expect(listed.event.categories).toEqual(["Comedy Shows"]);
  expect(listed.rawPayload?.body).toEqual({ id: "listed", note: "raw body" });
  expect(listed.dedupeGroup).toEqual([]);

  const dup = ["dup", "dup-d"].map((s) => getEvent(db, id(s)));
  for (const view of dup) expect(view.dedupeGroup).toHaveLength(1);
  const hidden = dup.find((view) => !view.listed)!;
  expect(hidden.hiddenReasons[0]).toMatch(/^duplicate of /);

  // newest of several payloads wins
  const row = db.prepare("SELECT * FROM raw_payload WHERE source_event_id = 'listed'").get() as Record<string, string>;
  db.prepare(
    "INSERT INTO raw_payload (id, sync_run_id, source, source_event_id, fetched_at, body, content_hash) VALUES ('newer', ?, ?, 'listed', '2999-01-01T00:00:00.000Z', 'not json', 'h')",
  ).run(row.sync_run_id!, row.source!);
  expect(getEvent(db, id("listed")).rawPayload).toEqual({ fetchedAt: "2999-01-01T00:00:00.000Z", body: "not json" });

  expect(status(() => getEvent(db, "missing"))).toBe(404);
  db.close();
});

test("mutes: create validates, lists a hide count, delete is by id", async () => {
  const db = await seedAdmin();
  const created = createMute(db, { field: "category", value: " comedy ", note: "n" });
  expect(created).toMatchObject({ field: "category", value: "comedy", note: "n", hides: 1 });
  expect(createMute(db, { field: "category", value: "comedy" }).id).toBe(created.id); // idempotent
  expect(listMutes(db).mutes).toHaveLength(1);
  expect(listEvents(db, q("visibility=hidden")).events.find((e) => e.title === "Standup Night")?.hiddenReasons).toEqual([
    "muted by category=comedy",
  ]);

  for (const body of [
    null,
    "x",
    {},
    { field: "price", value: "x" },
    { field: "title", value: "  " },
    { field: "title", value: "x".repeat(201) },
    { field: "title", value: "x", note: 5 },
  ]) {
    expect({ body, result: status(() => createMute(db, body)) }).toEqual({ body, result: 400 });
  }
  expect(status(() => deleteMute(db, "nope"))).toBe(404);
  deleteMute(db, created.id);
  expect(listMutes(db).mutes).toEqual([]);
  db.close();
});

test("sources lists every registry adapter with its last 7 runs, newest first", async () => {
  const db = await seedAdmin();
  const insertRun = db.prepare("INSERT INTO sync_run (id, started_at, status) VALUES (?, ?, 'success')");
  const insertSource = db.prepare(
    "INSERT INTO sync_run_source (sync_run_id, source, status, occurrences) VALUES (?, 'communitie', 'ok', ?)",
  );
  for (let i = 0; i < 9; i += 1) {
    const id = `00000000-0000-4000-8000-00000000000${i}`;
    insertRun.run(id, `2026-01-0${i + 1}T00:00:00.000Z`);
    insertSource.run(id, i);
  }
  const sources = listSources(db);
  expect(sources.map((s) => s.name)).toEqual(SOURCE_ADAPTERS.map((a) => a.name));
  const communitie = sources.find((s) => s.name === "communitie")!;
  expect(communitie.optIn).toBe(false);
  expect(communitie.recentRuns.map((r) => r.occurrences)).toEqual([8, 7, 6, 5, 4, 3, 2]);
  expect(sources.find((s) => s.name === "bookmyshow")!.recentRuns).toHaveLength(1);
  db.close();
});

test("runs: list newest first with per-source rows; detail reads an agent report and tolerates its absence", async () => {
  const db = await seedAdmin();
  const runs = listRuns(db, q("limit=5")).runs;
  expect(runs).toHaveLength(1);
  expect(runs[0]!.sources.map((s) => s.source)).toEqual(["bookmyshow", "district"]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-runs-"));
  const runId = runs[0]!.id;
  db.prepare("INSERT INTO sync_run_source (sync_run_id, source, status) VALUES (?, 'agent:grok', 'ok')").run(runId);
  db.prepare("INSERT INTO sync_run_source (sync_run_id, source, status) VALUES (?, 'agent:other', 'ok')").run(runId);
  fs.mkdirSync(path.join(dir, `${runId}-grok`));
  fs.writeFileSync(
    path.join(dir, `${runId}-grok`, "report.json"),
    JSON.stringify({ harness: "grok", accepted: 3, quarantined: [], rejected: [] }),
  );
  fs.mkdirSync(path.join(dir, `${runId}-other`));
  fs.writeFileSync(path.join(dir, `${runId}-other`, "report.json"), "{ half written");

  const detail = getRun(db, runId, dir);
  expect(detail.agentReports["agent:grok"]).toMatchObject({ harness: "grok", accepted: 3 });
  expect(detail.agentReports["agent:other"]).toBeNull();
  expect(Object.keys(detail.agentReports)).toEqual(["agent:grok", "agent:other"]);

  expect(status(() => getRun(db, "not-a-uuid", dir))).toBe(400);
  expect(status(() => getRun(db, "00000000-0000-4000-8000-000000000000", dir))).toBe(404);
  expect(status(() => listRuns(db, q("limit=0")))).toBe(400);
  expect(status(() => listRuns(db, q("limit=201")))).toBe(400);
  fs.rmSync(dir, { recursive: true });
  db.close();
});

test("admin raw payload lookup cannot select another source's matching ID", async () => {
  const db = await seedAdmin();
  const row = db.query("SELECT id, source FROM event WHERE source_event_id = 'listed'").get() as { id: string; source: string };
  const run = db.query("SELECT sync_run_id FROM raw_payload LIMIT 1").get() as { sync_run_id: string };
  db.query(
    "INSERT INTO raw_payload (id, sync_run_id, source, source_event_id, fetched_at, body, content_hash) VALUES ('collision', ?, 'other', 'listed', '2999-01-01', '{}', 'hash')",
  ).run(run.sync_run_id);
  expect(getEvent(db, row.id).rawPayload?.body).toEqual({ id: "listed", note: "raw body" });
  db.close();
});
