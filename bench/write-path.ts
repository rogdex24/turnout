/**
 * Reproduces the two sync-path measurements: SQLite write throughput and
 * dedupe scaling. Run against a scratch DB, or pass a path to size dedupe
 * against real data:
 *
 *   bun run bench/write-path.ts
 *   bun run bench/write-path.ts data/hydsocial.sqlite
 */

import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupDuplicates } from "../src/catalog/dedupe.js";
import type { EventRow } from "../src/catalog/types.js";
import { migrate } from "../src/migrate.js";
import { hasColumn } from "../src/utils/db.js";

const EVENTS = 800;

interface WriteCase {
  label: string;
  wal: boolean;
  batched: boolean;
}

function writePath({ label, wal, batched }: WriteCase): number {
  const db = new Database(join(tmpdir(), `hydsocial-bench-${label}-${randomUUID()}.sqlite`), {
    create: true,
    strict: true,
  });
  migrate(db);
  db.exec(`PRAGMA journal_mode = ${wal ? "WAL" : "DELETE"}`);
  const mode = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
  assert.equal(mode.journal_mode, wal ? "wal" : "delete");

  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO sync_run (id, started_at, status) VALUES (?, ?, 'running')").run(runId, now);

  const insertRaw = db.prepare(
    "INSERT INTO raw_payload (id, sync_run_id, source, source_event_id, fetched_at, body, content_hash) VALUES (?, ?, 'district', ?, ?, ?, ?)",
  );
  const upsert = db.prepare(`
    INSERT INTO event (
      id, source, source_event_id, source_slot_id, slug, title, description, starts_at, ends_at,
      venue_id, venue_name, address, latitude, longitude, area, categories, tags, price_min, is_free,
      source_url, content_hash, status, missed_runs, first_seen_at, last_seen_at, last_seen_run_id, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',0,?,?,?,?)
    ON CONFLICT(source, source_event_id, source_slot_id) DO UPDATE SET title = excluded.title`);

  const work = () => {
    for (let i = 0; i < EVENTS; i += 1) {
      insertRaw.run(randomUUID(), runId, `e${i}`, now, JSON.stringify({ id: `e${i}`, blob: "x".repeat(400) }), "hash");
      upsert.run(
        randomUUID(),
        "district",
        `e${i}`,
        "s1",
        `e${i}`,
        `Event ${i}`,
        "d",
        now,
        null,
        null,
        `Venue ${i}`,
        "addr",
        17.4,
        78.3,
        "gachibowli",
        '["music"]',
        "[]",
        500,
        0,
        "https://example.test",
        "hash",
        now,
        now,
        runId,
        now,
      );
    }
  };

  const started = performance.now();
  if (batched) db.transaction(work)();
  else work();
  const elapsed = performance.now() - started;
  db.close();
  return elapsed;
}

const cases: WriteCase[] = [
  { label: "plain", wal: false, batched: false },
  { label: "tx", wal: false, batched: true },
  { label: "wal", wal: true, batched: false },
  { label: "waltx", wal: true, batched: true },
];
const [plain, tx, wal, walTx] = cases.map(writePath) as [number, number, number, number];

console.log(`SQLite write path, ${EVENTS} events (1 raw_payload insert + 1 event upsert each)\n`);
console.log(`  DELETE, no transaction : ${plain.toFixed(0).padStart(5)} ms   baseline`);
console.log(`  DELETE, transaction    : ${tx.toFixed(0).padStart(5)} ms   ${(plain / tx).toFixed(0)}x`);
console.log(`  WAL,    no transaction : ${wal.toFixed(0).padStart(5)} ms   ${(plain / wal).toFixed(1)}x`);
console.log(`  WAL,    transaction    : ${walTx.toFixed(0).padStart(5)} ms   ${(plain / walTx).toFixed(0)}x`);

const dbPath = process.argv[2];
if (dbPath) {
  const db = new Database(dbPath, { readonly: true, strict: true });
  const select = `SELECT id, source, source_event_id AS sourceEventId, title, venue_name AS venueName,
                         starts_at AS startsAt, ${hasColumn(db, "event", "time_kind") ? "time_kind" : "'timed'"} AS timeKind, first_seen_at AS firstSeenAt FROM event`;
  console.log(`\nDedupe scaling against ${dbPath}\n`);
  for (const [label, sql] of [
    ["active only", `${select} WHERE status='active'`],
    ["all rows", select],
  ] as const) {
    const rows = db.prepare(sql).all() as EventRow[];
    const started = performance.now();
    const groups = groupDuplicates(rows);
    const elapsed = performance.now() - started;
    console.log(`  ${label.padEnd(12)} n=${String(rows.length).padStart(5)}  ${elapsed.toFixed(0).padStart(5)} ms  ${groups.size} groups`);
  }
  db.close();
}
