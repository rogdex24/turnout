import { Database } from "bun:sqlite";

export interface OpenDbOptions {
  /** Read-only handles never set the journal mode: the writer owns it. */
  readonly?: boolean;
  /** Create the file when it is missing. Writable handles only. Default true. */
  create?: boolean;
}

/**
 * The one way the server, the admin, sync and the tests open the SQLite file. Three writer processes
 * (serve, admin, sync) share one WAL file, so every handle waits out another writer for up to five
 * seconds instead of failing, and every handle enforces foreign keys (SQLite leaves them off by default).
 * See https://www.sqlite.org/wal.html.
 */
export function openDb(path: string, { readonly = false, create = true }: OpenDbOptions = {}): Database {
  const db = readonly ? new Database(path, { readonly: true, strict: true }) : new Database(path, { create, strict: true });
  // busy_timeout first: switching the journal mode takes a lock too.
  db.exec("PRAGMA busy_timeout = 5000");
  if (!readonly) db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
