import type { Database } from "bun:sqlite";
import { hasColumn } from "../utils/db.js";

/** A run still marked 'running' after this long was killed, not still working. */
export const ABANDONED_RUN_HOURS = 6;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sync_run (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  events_fetched INTEGER NOT NULL DEFAULT 0,
  events_created INTEGER NOT NULL DEFAULT 0,
  events_updated INTEGER NOT NULL DEFAULT 0,
  events_delisted INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

-- One row per source per run. sync_run's totals cannot say which source went
-- quiet, which is what a degraded scraper looks like.
CREATE TABLE IF NOT EXISTS sync_run_source (
  sync_run_id TEXT NOT NULL REFERENCES sync_run(id),
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  items_fetched INTEGER NOT NULL DEFAULT 0,
  occurrences INTEGER NOT NULL DEFAULT 0,
  missing_venue INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  PRIMARY KEY (sync_run_id, source)
);
CREATE INDEX IF NOT EXISTS idx_sync_run_source_health ON sync_run_source(source, status);

CREATE TABLE IF NOT EXISTS raw_payload (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES sync_run(id),
  source TEXT,
  source_event_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_payload_source_event ON raw_payload(source_event_id);
CREATE INDEX IF NOT EXISTS idx_raw_payload_fetched_at ON raw_payload(fetched_at);
`;

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  if (!hasColumn(db, "raw_payload", "source")) {
    db.exec("ALTER TABLE raw_payload ADD COLUMN source TEXT");
    // A single-source historical run is attributable; multi-source runs are not.
    db.exec(`UPDATE raw_payload SET source = (
      SELECT MIN(source) FROM sync_run_source
      WHERE sync_run_id = raw_payload.sync_run_id HAVING COUNT(*) = 1
    )`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_raw_payload_identity ON raw_payload(source, source_event_id, fetched_at)");
}
