import type { Database } from "bun:sqlite";

const SCHEMA_SQL = `
-- Serve-time mute rules. Sync still ingests everything; these decide what is
-- served, so unmuting needs no re-sync.
CREATE TABLE IF NOT EXISTS mute_rule (
  id TEXT PRIMARY KEY,
  field TEXT NOT NULL CHECK (field IN ('category', 'source', 'venue', 'area', 'title')),
  value TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(field, value)
);
`;

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
}
