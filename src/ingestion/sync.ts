import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { inferArea } from "../catalog/area.js";
import { classify } from "../catalog/category.js";
import { groupDuplicates } from "../catalog/dedupe.js";
import type { EventRow } from "../catalog/types.js";
import { resolveVenueId, venueArea } from "../catalog/venue.js";
import type { FetchLike } from "../utils/http.js";
import { checkSourceHealth, HEALTH_HISTORY_RUNS } from "./health.js";
import { ABANDONED_RUN_HOURS } from "./schema.js";
import { SOURCE_ADAPTERS } from "./sources/registry.js";
import type { FetchedItem, SourceAdapter } from "./sources/types.js";

const RAW_PAYLOAD_RETENTION_DAYS = 30;
const MISSED_RUNS_BEFORE_DELIST = 2;

export interface SyncOptions {
  /** Must already be migrated: ingestion does not own the whole schema. */
  db: Database;
  fetchImpl?: FetchLike;
  sleepMs?: number;
  now?: () => Date;
  /** Bypasses every adapter's fetch entirely, keyed by source name. Used by tests. */
  fetchedBySource?: Record<string, FetchedItem[]>;
  /** Restrict which registry adapters run. Defaults to every registered source. */
  sources?: string[];
  /** Overrides the registry. Used by tests to run a fake adapter end to end. */
  adapters?: SourceAdapter[];
  /** Id for this run's sync_run row, so a caller that spawned the sync can find it. Defaults to a fresh uuid. */
  runId?: string;
  /** Directory of the database file, handed to adapters. Defaults to ./data. */
  dataDir?: string;
}

export interface SyncResult {
  runId: string;
  fetched: number;
  created: number;
  updated: number;
  delisted: number;
  /** Sources that threw during fetch; other sources still synced. */
  sourceErrors: Record<string, string>;
  /** Sources whose output collapsed against their recent median. Their rows are
   * still stored, but they are excluded from reconciliation so nothing is delisted. */
  unhealthySources: Record<string, string>;
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { db } = options;

  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? randomUUID();

  // A killed run leaves its row 'running' for ever, so the history reads as
  // though a sync is still in flight. Close out the stale ones first, with a
  // window wide enough not to disturb a genuinely concurrent run.
  db.prepare("UPDATE sync_run SET status = 'abandoned', finished_at = ? WHERE status = 'running' AND started_at < ?").run(
    now().toISOString(),
    new Date(now().getTime() - ABANDONED_RUN_HOURS * 60 * 60 * 1000).toISOString(),
  );

  db.prepare("INSERT INTO sync_run (id, started_at, status) VALUES (?, ?, 'running')").run(runId, now().toISOString());

  try {
    const adapters = options.adapters ?? SOURCE_ADAPTERS;
    const { fetchedBySource, sourceErrors } = await gatherFetchedBySource(options, adapters, runId);
    const fetched = Object.values(fetchedBySource).reduce((sum, items) => sum + items.length, 0);
    const unhealthySources = assessSourceHealth(db, runId, fetchedBySource, sourceErrors);
    // Only sources that both succeeded and look healthy may delist their rows.
    // A parser that quietly matches nothing produces an empty list, not an
    // error, and reconciling on that wipes the source out within two runs.
    const keepsRows = new Set(adapters.filter((adapter) => adapter.noDelist).map((adapter) => adapter.name));
    const succeededSources = Object.keys(fetchedBySource).filter((source) => !(source in unhealthySources) && !keepsRows.has(source));

    // One transaction for the whole persist phase. SQLite otherwise fsyncs per
    // statement, and this loop runs two statements per occurrence. It also makes
    // the phase atomic, so a crash mid-sync cannot leave a half-written run.
    const { created, updated, delisted } = db.transaction(() => {
      const stored = storeEvents(db, fetchedBySource, runId, now);
      const delistedCount = reconcileStale(db, runId, now, succeededSources);
      dedupe(db);
      pruneOldRawPayloads(db, now);
      return { ...stored, delisted: delistedCount };
    })();

    db.prepare(
      `UPDATE sync_run SET finished_at = ?, status = 'success', events_fetched = ?,
       events_created = ?, events_updated = ?, events_delisted = ?, error = ? WHERE id = ?`,
    ).run(
      now().toISOString(),
      fetched,
      created,
      updated,
      delisted,
      Object.keys({ ...sourceErrors, ...unhealthySources }).length ? JSON.stringify({ ...sourceErrors, ...unhealthySources }) : null,
      runId,
    );

    return { runId, fetched, created, updated, delisted, sourceErrors, unhealthySources };
  } catch (error) {
    db.prepare("UPDATE sync_run SET finished_at = ?, status = 'failed', error = ? WHERE id = ?").run(
      now().toISOString(),
      String(error),
      runId,
    );
    throw error;
  }
}

/** Live registry fetch, unless a test injected a bypass. Every sync run covers every source in one pass. */
async function gatherFetchedBySource(
  options: SyncOptions,
  registry: SourceAdapter[],
  runId: string,
): Promise<{ fetchedBySource: Record<string, FetchedItem[]>; sourceErrors: Record<string, string> }> {
  if (options.fetchedBySource) return { fetchedBySource: options.fetchedBySource, sourceErrors: {} };
  const adapters = selectAdapters(registry, options.sources);
  const fetchedBySource: Record<string, FetchedItem[]> = {};
  const sourceErrors: Record<string, string> = {};

  for (const adapter of adapters) {
    try {
      fetchedBySource[adapter.name] = await adapter.fetch({
        fetchImpl: options.fetchImpl,
        sleepMs: options.sleepMs,
        now: options.now,
        runId,
        dataDir: options.dataDir,
      });
    } catch (error) {
      sourceErrors[adapter.name] = String(error);
      console.error(`Source ${adapter.name} failed; continuing with other sources:`, error);
    }
  }
  return { fetchedBySource, sourceErrors };
}

/**
 * Records what each source produced this run and judges it against its own
 * recent history. Returns the sources that look degraded, keyed to the reason.
 *
 * A source that threw is recorded as failed and is not health-checked; the
 * throw already excluded it from reconciliation. A source that returned rows
 * without throwing is the case this exists for.
 */
function assessSourceHealth(
  db: Database,
  runId: string,
  fetchedBySource: Record<string, FetchedItem[]>,
  sourceErrors: Record<string, string>,
): Record<string, string> {
  const recentHealthy = db.prepare(
    `SELECT occurrences FROM sync_run_source
     WHERE source = ? AND status = 'ok'
     ORDER BY rowid DESC LIMIT ?`,
  );
  const record = db.prepare(
    `INSERT INTO sync_run_source (sync_run_id, source, status, items_fetched, occurrences, missing_venue, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const unhealthy: Record<string, string> = {};

  for (const [source, error] of Object.entries(sourceErrors)) {
    record.run(runId, source, "failed", 0, 0, 0, error);
  }

  for (const [source, items] of Object.entries(fetchedBySource)) {
    const occurrences = items.reduce((sum, item) => sum + item.occurrences.length, 0);
    const missingVenue = items.reduce(
      (sum, item) => sum + item.occurrences.filter((occurrence) => !occurrence.venueName?.trim()).length,
      0,
    );
    const history = (recentHealthy.all(source, HEALTH_HISTORY_RUNS) as { occurrences: number }[]).map((row) => row.occurrences);

    const verdict = checkSourceHealth(occurrences, history);
    if (!verdict.healthy && verdict.reason) {
      unhealthy[source] = verdict.reason;
      console.error(`Source ${source} looks degraded; keeping its rows but not reconciling: ${verdict.reason}`);
    }
    record.run(runId, source, verdict.healthy ? "ok" : "unhealthy", items.length, occurrences, missingVenue, verdict.reason);
  }

  return unhealthy;
}

function storeEvents(
  db: Database,
  fetchedBySource: Record<string, FetchedItem[]>,
  runId: string,
  now: () => Date,
): { created: number; updated: number } {
  const insertRawPayload = db.prepare(
    "INSERT INTO raw_payload (id, sync_run_id, source, source_event_id, fetched_at, body, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const latestPayloadHash = db.prepare(
    "SELECT content_hash FROM raw_payload WHERE source = ? AND source_event_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1",
  );
  const findExisting = db.prepare("SELECT id FROM event WHERE source = ? AND source_event_id = ? AND source_slot_id = ?");
  const upsertEvent = db.prepare(`
    INSERT INTO event (
      id, source, source_event_id, source_slot_id, slug, title, description, starts_at, ends_at, time_kind,
      venue_id, venue_name, address, latitude, longitude, area, categories, category, tags, price_min, is_free,
      source_url, image_url, organiser_name, content_hash, status, missed_runs, first_seen_at, last_seen_at, last_seen_run_id, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?, ?
    )
    ON CONFLICT(source, source_event_id, source_slot_id) DO UPDATE SET
      slug = excluded.slug,
      title = excluded.title,
      description = excluded.description,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      time_kind = excluded.time_kind,
      venue_id = excluded.venue_id,
      venue_name = excluded.venue_name,
      address = excluded.address,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      area = excluded.area,
      categories = excluded.categories,
      category = excluded.category,
      tags = excluded.tags,
      price_min = excluded.price_min,
      is_free = excluded.is_free,
      source_url = excluded.source_url,
      image_url = excluded.image_url,
      organiser_name = excluded.organiser_name,
      content_hash = excluded.content_hash,
      status = 'active',
      missed_runs = 0,
      last_seen_at = excluded.last_seen_at,
      last_seen_run_id = excluded.last_seen_run_id,
      updated_at = CASE WHEN event.content_hash = excluded.content_hash
                        THEN event.updated_at ELSE excluded.updated_at END
  `);

  let created = 0;
  let updated = 0;

  for (const [source, items] of Object.entries(fetchedBySource)) {
    for (const item of items) {
      const nowIso = now().toISOString();
      const body = JSON.stringify(item.raw);
      const contentHash = createHash("sha256").update(body).digest("hex");
      // Most sources republish an unchanged record every run. Archiving a byte
      // identical copy each time is what makes raw_payload grow without saying
      // anything new, so only a changed payload is stored.
      const archived = latestPayloadHash.get(source, item.id) as { content_hash: string } | null | undefined;
      if (archived?.content_hash !== contentHash) {
        insertRawPayload.run(randomUUID(), runId, source, item.id, nowIso, body, contentHash);
      }

      for (const occurrence of item.occurrences) {
        const existing = findExisting.get(source, occurrence.sourceEventId, occurrence.sourceSlotId) as { id: string } | null | undefined;
        const id = existing?.id ?? randomUUID();

        const inferredArea = inferArea(occurrence.venueName, occurrence.address);
        const venueId = resolveVenueId(db, {
          name: occurrence.venueName,
          address: occurrence.address,
          area: inferredArea,
          latitude: occurrence.latitude,
          longitude: occurrence.longitude,
          nowIso,
        });
        // The venue may know the area when the event's own text did not.
        const area = inferredArea !== "other" ? inferredArea : (venueArea(db, venueId) ?? "other");
        upsertEvent.run(
          id,
          source,
          occurrence.sourceEventId,
          occurrence.sourceSlotId,
          occurrence.slug,
          occurrence.title,
          occurrence.description,
          occurrence.startsAt,
          occurrence.endsAt,
          occurrence.timeKind,
          venueId,
          occurrence.venueName,
          occurrence.address,
          occurrence.latitude,
          occurrence.longitude,
          area,
          JSON.stringify(occurrence.categories),
          classify(occurrence.categories, occurrence.title, occurrence.tags),
          JSON.stringify(occurrence.tags),
          occurrence.priceMin,
          occurrence.isFree ? 1 : 0,
          occurrence.sourceUrl,
          occurrence.imageUrl ?? null,
          occurrence.organiser ?? null,
          contentHash,
          nowIso,
          nowIso,
          runId,
          nowIso,
        );

        if (existing) updated += 1;
        else created += 1;
      }
    }
  }

  return { created, updated };
}

/** Events not seen in this run get one strike; a second consecutive miss delists them. Never deleted.
 * Only sources that succeeded this run are reconciled, so a dead adapter cannot delist its peers.
 */
function reconcileStale(db: Database, runId: string, now: () => Date, succeededSources: string[]): number {
  if (succeededSources.length === 0) return 0;
  const placeholders = succeededSources.map(() => "?").join(", ");
  const stale = db
    .prepare(`SELECT id, missed_runs FROM event WHERE status = 'active' AND last_seen_run_id != ? AND source IN (${placeholders})`)
    .all(runId, ...succeededSources) as { id: string; missed_runs: number }[];

  const bump = db.prepare("UPDATE event SET missed_runs = missed_runs + 1, updated_at = ? WHERE id = ?");
  const delist = db.prepare("UPDATE event SET status = 'delisted', updated_at = ? WHERE id = ?");

  let delisted = 0;
  const nowIso = now().toISOString();
  for (const row of stale) {
    if (row.missed_runs + 1 >= MISSED_RUNS_BEFORE_DELIST) {
      delist.run(nowIso, row.id);
      delisted += 1;
    } else {
      bump.run(nowIso, row.id);
    }
  }
  return delisted;
}

function dedupe(db: Database): void {
  const rows = db
    .prepare(
      "SELECT id, source, source_event_id AS sourceEventId, title, venue_name AS venueName, starts_at AS startsAt, time_kind AS timeKind, first_seen_at AS firstSeenAt FROM event WHERE status = 'active'",
    )
    .all() as EventRow[];

  const groups = groupDuplicates(rows);

  db.prepare("UPDATE event SET is_canonical = 0, dedupe_group_id = NULL WHERE status = 'active'").run();
  const setGroup = db.prepare("UPDATE event SET dedupe_group_id = ?, is_canonical = ? WHERE id = ?");
  for (const [canonicalId, memberIds] of groups) {
    for (const memberId of memberIds) {
      setGroup.run(canonicalId, memberId === canonicalId ? 1 : 0, memberId);
    }
  }
}

/**
 * Drops payloads past the retention window, except the newest one for each
 * record. Now that an unchanged payload is not re-archived, a stable record's
 * only copy would otherwise age out and leave nothing to replay.
 */
function pruneOldRawPayloads(db: Database, now: () => Date): void {
  const cutoff = new Date(now().getTime() - RAW_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `DELETE FROM raw_payload
     WHERE source IS NOT NULL AND fetched_at < ?
       AND id NOT IN (SELECT id FROM raw_payload GROUP BY source, source_event_id HAVING fetched_at = MAX(fetched_at))`,
  ).run(cutoff);
}

/** Named sources run whether or not they are opt-in; with no names, every source except the opt-in ones runs. */
export function selectAdapters(adapters: SourceAdapter[], names?: string[]): SourceAdapter[] {
  if (!names) return adapters.filter((adapter) => !adapter.optIn);
  const wanted = new Set(names);
  return adapters.filter((adapter) => wanted.has(adapter.name));
}
