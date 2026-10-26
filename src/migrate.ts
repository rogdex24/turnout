import type { Database } from "bun:sqlite";
import { migrate as migrateCatalog } from "./catalog/schema.js";
import { migrate as migrateCuration } from "./curation/schema.js";
import { migrate as migrateIngestion } from "./ingestion/schema.js";
import { migrate as migrateWeb } from "./web/schema.js";

/** Each module owns its tables. Order matters only for web, whose view reads catalog and curation tables. */
export function migrate(db: Database): void {
  // WAL persists in the file header, so this runs once and readers inherit it.
  // Readers also stop blocking on the sync's write transaction under WAL.
  db.exec("PRAGMA journal_mode = WAL");
  migrateIngestion(db);
  migrateCatalog(db);
  migrateCuration(db);
  migrateWeb(db);
}
