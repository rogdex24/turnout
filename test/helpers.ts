import { Database } from "bun:sqlite";
import type { RawEvent } from "../src/ingestion/sources/communitie.js";
import { normalizeEvent } from "../src/ingestion/sources/communitie.js";
import type { FetchedItem } from "../src/ingestion/sources/types.js";
import { migrate } from "../src/migrate.js";

/** Feed raw Communitie events to runSync without hitting the network. */
export function communitieItems(rawEvents: RawEvent[]): Record<string, FetchedItem[]> {
  return { communitie: rawEvents.map((raw) => ({ id: raw.id, raw, occurrences: normalizeEvent(raw) })) };
}

/** A fresh in-memory database with every module's tables, as cli.ts opens one. */
export function memoryDb(): Database {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  return db;
}
