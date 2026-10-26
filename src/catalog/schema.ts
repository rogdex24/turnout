import type { Database } from "bun:sqlite";
import { hasColumn } from "../utils/db.js";
import { classify } from "./category.js";
import { backfillVenueIds, backfillVenueLocations, GEOCODE_SOURCES, GEOCODE_STATES } from "./venue.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS venue (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  aliases TEXT NOT NULL DEFAULT '[]',
  area TEXT NOT NULL DEFAULT 'other',
  address TEXT,
  lat REAL,
  lng REAL,
  google_place_id TEXT,
  geocode_state TEXT NOT NULL DEFAULT 'pending',
  venue_type TEXT NOT NULL DEFAULT 'other',
  instagram_handle TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venue_area ON venue(area);
CREATE INDEX IF NOT EXISTS idx_venue_geocode_state ON venue(geocode_state);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'communitie',
  source_event_id TEXT NOT NULL,
  source_slot_id TEXT NOT NULL,
  slug TEXT,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  time_kind TEXT NOT NULL DEFAULT 'timed' CHECK (time_kind IN ('timed', 'date-only')),
  ends_at TEXT,
  venue_id TEXT REFERENCES venue(id),
  venue_name TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  area TEXT NOT NULL DEFAULT 'other',
  categories TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'other',
  tags TEXT NOT NULL DEFAULT '[]',
  price_min REAL,
  is_free INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL,
  image_url TEXT,
  organiser_name TEXT,
  content_hash TEXT NOT NULL,
  dedupe_group_id TEXT,
  is_canonical INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  missed_runs INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_seen_run_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source, source_event_id, source_slot_id)
);
CREATE INDEX IF NOT EXISTS idx_event_status_starts_at ON event(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_event_dedupe_group ON event(dedupe_group_id);
`;

/**
 * SQLite cannot add a CHECK to a column that already exists, so a trigger
 * rejects values outside the geocode vocabulary from every writer, including
 * ones added later (the admin panel). Recreated on each migrate so the lists
 * in venue.ts stay the single definition.
 */
const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(", ");
const GEOCODE_TRIGGERS_SQL = ["INSERT", "UPDATE OF geocode_state, geocode_source"]
  .map(
    (event, index) => `
DROP TRIGGER IF EXISTS venue_geocode_check_${index};
CREATE TRIGGER venue_geocode_check_${index} BEFORE ${event} ON venue
WHEN NEW.geocode_state NOT IN (${quoted(GEOCODE_STATES)})
  OR (NEW.geocode_source IS NOT NULL AND NEW.geocode_source NOT IN (${quoted(GEOCODE_SOURCES)}))
BEGIN SELECT RAISE(ABORT, 'invalid venue geocode_state or geocode_source'); END;`,
  )
  .join("\n");

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  // Additive columns for DBs created before these fields existed.
  if (!hasColumn(db, "event", "time_kind")) {
    db.exec("ALTER TABLE event ADD COLUMN time_kind TEXT NOT NULL DEFAULT 'timed' CHECK (time_kind IN ('timed', 'date-only'))");
    // Legacy BookMyShow rows used a fabricated 19:00 IST start and duration.
    // Release groups formed using that invented time before the next sync.
    db.exec(
      "UPDATE event SET dedupe_group_id = NULL, is_canonical = 1 WHERE source = 'bookmyshow' OR dedupe_group_id IN (SELECT dedupe_group_id FROM event WHERE source = 'bookmyshow')",
    );
    db.exec(
      "UPDATE event SET time_kind = 'date-only', starts_at = strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '-19 hours'), ends_at = NULL WHERE source = 'bookmyshow'",
    );
  }
  if (!hasColumn(db, "event", "area")) {
    db.exec("ALTER TABLE event ADD COLUMN area TEXT NOT NULL DEFAULT 'other'");
  }
  if (!hasColumn(db, "event", "venue_id")) {
    db.exec("ALTER TABLE event ADD COLUMN venue_id TEXT");
  }
  if (!hasColumn(db, "event", "category")) {
    db.exec("ALTER TABLE event ADD COLUMN category TEXT NOT NULL DEFAULT 'other'");
  }
  if (!hasColumn(db, "venue", "geocode_source")) {
    db.exec("ALTER TABLE venue ADD COLUMN geocode_source TEXT");
  }
  if (!hasColumn(db, "venue", "geocoded_at")) {
    db.exec("ALTER TABLE venue ADD COLUMN geocoded_at TEXT");
  }
  if (!hasColumn(db, "event", "image_url")) {
    db.exec("ALTER TABLE event ADD COLUMN image_url TEXT");
  }
  if (!hasColumn(db, "event", "organiser_name")) {
    db.exec("ALTER TABLE event ADD COLUMN organiser_name TEXT");
  }
  db.exec(GEOCODE_TRIGGERS_SQL);
  db.exec("CREATE INDEX IF NOT EXISTS idx_event_area_starts_at ON event(area, starts_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_event_venue_id ON event(venue_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_event_category_starts_at ON event(category, starts_at)");
  // One-shot / idempotent: attach venue rows for events that predate venue_id.
  backfillVenueIds(db);
  backfillVenueLocations(db);
  backfillCategories(db);
}

/**
 * Classifies events stored before `category` existed. Idempotent, and cheap
 * after the first run because it only reads rows still sitting on the default.
 */
function backfillCategories(db: Database): void {
  const rows = db.prepare("SELECT id, title, categories, tags FROM event WHERE category = 'other'").all() as {
    id: string;
    title: string;
    categories: string;
    tags: string;
  }[];
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE event SET category = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of rows) {
      const category = classify(parseJsonArray(row.categories), row.title, parseJsonArray(row.tags));
      if (category !== "other") update.run(category, row.id);
    }
  })();
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}
