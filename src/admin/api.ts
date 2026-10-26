/**
 * Plain functions over the database for the admin routes. They validate their
 * input and throw HttpError; server.ts turns that into a response. Reads use
 * the read handle; only the mute functions take the write handle.
 */
import type { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { addMuteRule, countMuted, isMuteField, MUTE_FIELDS, type MuteField, removeMuteRule } from "../curation/mute.js";
import { SOURCE_ADAPTERS } from "../ingestion/sources/registry.js";
import { endOfDayIst, startOfDayIst } from "../utils/time.js";
import { isUuid } from "../utils/uuid.js";
import { hiddenReasons, IS_LISTED_SQL } from "./reasons.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const bad = (message: string) => new HttpError(400, message);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw bad(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

function textParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name)?.trim();
  if (!raw) return undefined;
  if (raw.length > 200) throw bad(`${name} is longer than 200 characters`);
  return raw;
}

function dateParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  if (!raw) return undefined;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (!DATE.test(raw) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw bad(`${name} must be a real date as YYYY-MM-DD`);
  }
  return raw;
}

function enumParam<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T | undefined {
  const raw = params.get(name);
  if (!raw) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) throw bad(`${name} must be one of ${allowed.join(", ")}`);
  return raw as T;
}

// ---- runs and sources ----

interface SourceRunRow {
  source: string;
  status: string;
  items_fetched: number;
  occurrences: number;
  missing_venue: number;
  error: string | null;
}

const sourceRunView = (row: SourceRunRow & { sync_run_id?: string; started_at?: string }) => ({
  ...(row.sync_run_id ? { runId: row.sync_run_id, startedAt: row.started_at } : {}),
  source: row.source,
  status: row.status,
  itemsFetched: row.items_fetched,
  occurrences: row.occurrences,
  missingVenue: row.missing_venue,
  error: row.error,
});

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  events_fetched: number;
  events_created: number;
  events_updated: number;
  events_delisted: number;
  error: string | null;
}

function runView(db: Database, row: RunRow) {
  const sources = db
    .prepare(
      "SELECT source, status, items_fetched, occurrences, missing_venue, error FROM sync_run_source WHERE sync_run_id = ? ORDER BY source",
    )
    .all(row.id) as SourceRunRow[];
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    eventsFetched: row.events_fetched,
    eventsCreated: row.events_created,
    eventsUpdated: row.events_updated,
    eventsDelisted: row.events_delisted,
    error: row.error,
    sources: sources.map(sourceRunView),
  };
}

export function listSources(db: Database) {
  const recent = db.prepare(
    `SELECT s.sync_run_id, r.started_at, s.source, s.status, s.items_fetched, s.occurrences, s.missing_venue, s.error
     FROM sync_run_source s JOIN sync_run r ON r.id = s.sync_run_id
     WHERE s.source = ? ORDER BY r.started_at DESC LIMIT 7`,
  );
  return SOURCE_ADAPTERS.map((adapter) => ({
    name: adapter.name,
    optIn: adapter.optIn === true,
    recentRuns: (recent.all(adapter.name) as (SourceRunRow & { sync_run_id: string; started_at: string })[]).map(sourceRunView),
  }));
}

export function listRuns(db: Database, params: URLSearchParams) {
  const limit = intParam(params, "limit", 20, 1, 200);
  const rows = db.prepare("SELECT * FROM sync_run ORDER BY started_at DESC LIMIT ?").all(limit) as RunRow[];
  return { runs: rows.map((row) => runView(db, row)) };
}

/** `agent:grok` writes its report under `<runId>-grok`; anything else has none. */
function readAgentReport(agentRunsDir: string, runId: string, source: string): unknown {
  const harness = source.startsWith("agent:") ? source.slice("agent:".length) : "";
  if (!/^[a-z0-9_-]+$/i.test(harness)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(agentRunsDir, `${runId}-${harness}`, "report.json"), "utf8"));
  } catch {
    return null; // absent or half-written: the panel shows the run without it
  }
}

export function getRun(db: Database, id: string, agentRunsDir: string) {
  if (!isUuid(id)) throw bad("run id must be a uuid");
  const row = db.prepare("SELECT * FROM sync_run WHERE id = ?").get(id) as RunRow | null;
  if (!row) throw new HttpError(404, "no such run");
  const run = runView(db, row);
  const agentReports: Record<string, unknown> = {};
  for (const source of run.sources) {
    if (source.source.startsWith("agent:")) agentReports[source.source] = readAgentReport(agentRunsDir, id, source.source);
  }
  return { ...run, agentReports };
}

// ---- events ----

const STATUSES = ["active", "delisted"] as const;
const VISIBILITIES = ["listed", "hidden"] as const;

interface EventListRow {
  id: string;
  source: string;
  source_event_id: string;
  title: string;
  starts_at: string;
  venue_name: string | null;
  area: string;
  category: string;
  price_min: number | null;
  is_free: number;
  source_url: string;
  status: string;
  listed: number;
}

export function listEvents(db: Database, params: URLSearchParams) {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const add = (clause: string, ...bound: (string | number)[]) => {
    where.push(clause);
    values.push(...bound);
  };

  const source = textParam(params, "source");
  if (source) add("event.source = ?", source);
  const status = enumParam(params, "status", STATUSES);
  if (status) add("event.status = ?", status);
  const visibility = enumParam(params, "visibility", VISIBILITIES);
  if (visibility) add(visibility === "listed" ? IS_LISTED_SQL : `NOT ${IS_LISTED_SQL}`);
  const category = textParam(params, "category");
  if (category) add("event.category = ?", category);
  const area = textParam(params, "area");
  if (area) add("event.area = ?", area);
  const from = dateParam(params, "from");
  if (from) add("event.starts_at >= ?", startOfDayIst(from));
  const to = dateParam(params, "to");
  if (to) add("event.starts_at <= ?", endOfDayIst(to));
  const q = textParam(params, "q");
  if (q) {
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    add("(LOWER(event.title) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(event.venue_name, '')) LIKE ? ESCAPE '\\')", like, like);
  }

  const page = intParam(params, "page", 1, 1, 1_000_000);
  const pageSize = intParam(params, "pageSize", 50, 1, 200);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT COUNT(*) c FROM event ${clause}`).get(...values) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT event.id, event.source, event.source_event_id, event.title, event.starts_at, event.venue_name, event.area,
              event.category, event.price_min, event.is_free, event.source_url, event.status, ${IS_LISTED_SQL} AS listed
       FROM event ${clause} ORDER BY event.starts_at DESC, event.id LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, (page - 1) * pageSize) as EventListRow[];

  return {
    total,
    page,
    pageSize,
    events: rows.map((row) => ({
      id: row.id,
      source: row.source,
      sourceEventId: row.source_event_id,
      title: row.title,
      startsAt: row.starts_at,
      venueName: row.venue_name,
      area: row.area,
      category: row.category,
      priceMin: row.price_min,
      isFree: row.is_free === 1,
      sourceUrl: row.source_url,
      status: row.status,
      listed: row.listed === 1,
      hiddenReasons: row.listed === 1 ? [] : hiddenReasons(db, row.id),
    })),
  };
}

interface DedupeMember {
  id: string;
  source: string;
  title: string;
  startsAt: string;
  venueName: string | null;
  isCanonical: number;
  status: string;
}

export function getEvent(db: Database, id: string) {
  const row = db.prepare(`SELECT event.*, ${IS_LISTED_SQL} AS listed FROM event WHERE event.id = ?`).get(id) as
    | (Record<string, unknown> & { listed: number; source: string; source_event_id: string; dedupe_group_id: string | null })
    | null;
  if (!row) throw new HttpError(404, "no such event");

  const group: DedupeMember[] = row.dedupe_group_id
    ? (db
        .prepare(
          `SELECT id, source, title, starts_at AS startsAt, venue_name AS venueName, is_canonical AS isCanonical, status
           FROM event WHERE dedupe_group_id = ? AND id != ? ORDER BY is_canonical DESC, source, id`,
        )
        .all(row.dedupe_group_id, id) as DedupeMember[])
    : [];

  const payload = db
    .prepare(
      "SELECT body, fetched_at AS fetchedAt FROM raw_payload WHERE source = ? AND source_event_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1",
    )
    .get(row.source, row.source_event_id) as { body: string; fetchedAt: string } | null;
  let rawPayload: { fetchedAt: string; body: unknown } | null = null;
  if (payload) {
    try {
      rawPayload = { fetchedAt: payload.fetchedAt, body: JSON.parse(payload.body) };
    } catch {
      rawPayload = { fetchedAt: payload.fetchedAt, body: payload.body };
    }
  }

  const { listed, ...event } = row;
  return {
    event: { ...event, categories: parseList(row.categories), tags: parseList(row.tags) },
    listed: listed === 1,
    hiddenReasons: listed === 1 ? [] : hiddenReasons(db, id),
    dedupeGroup: group,
    rawPayload,
  };
}

function parseList(value: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- mutes ----

interface MuteRow {
  id: string;
  field: MuteField;
  value: string;
  note: string | null;
  created_at: string;
}

const muteView = (db: Database, row: MuteRow) => ({
  id: row.id,
  field: row.field,
  value: row.value,
  note: row.note,
  createdAt: row.created_at,
  hides: countMuted(db, row.field, row.value),
});

export function listMutes(db: Database) {
  const rows = db.prepare("SELECT id, field, value, note, created_at FROM mute_rule ORDER BY field, value").all() as MuteRow[];
  return { mutes: rows.map((row) => muteView(db, row)) };
}

export function createMute(db: Database, body: unknown) {
  if (typeof body !== "object" || body === null) throw bad("body must be a JSON object");
  const { field, value, note } = body as Record<string, unknown>;
  if (typeof field !== "string" || !isMuteField(field)) throw bad(`field must be one of ${MUTE_FIELDS.join(", ")}`);
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw bad("value must be 1 to 200 characters");
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 500))
    throw bad("note must be a string of at most 500 characters");

  addMuteRule(db, field, value, typeof note === "string" && note.trim() ? note.trim() : undefined);
  const row = db
    .prepare("SELECT id, field, value, note, created_at FROM mute_rule WHERE field = ? AND value = ?")
    .get(field, value.trim()) as MuteRow;
  return muteView(db, row);
}

export function deleteMute(db: Database, id: string): void {
  const row = db.prepare("SELECT field, value FROM mute_rule WHERE id = ?").get(id) as { field: MuteField; value: string } | null;
  if (!row) throw new HttpError(404, "no such mute rule");
  removeMuteRule(db, row.field, row.value);
}
