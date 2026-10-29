/**
 * Plain functions over the database for the admin routes. They validate their
 * input and throw HttpError; server.ts turns that into a response. Reads use
 * the read handle; only the mute functions take the write handle.
 */
import type { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { handleRejectReasonSchema } from "@turnout/contract/profile";
import { ticketRejectReasonSchema } from "@turnout/contract/ticket";
import { z } from "zod";
import { addMuteRule, countMuted, isMuteField, MUTE_FIELDS, type MuteField, removeMuteRule } from "../curation/mute.js";
import { SOURCE_ADAPTERS } from "../ingestion/sources/registry.js";
import { accountDetail, failedNotices, pendingHandles, reportQueue, upcomingShows } from "../social/adminReads.js";
import { pepperCheck } from "../social/bans.js";
import { normalizePhone } from "../social/model/phone.js";
import { DEFAULT_TUNABLES } from "../social/model/tunables.js";
import {
  approveHandle,
  approveTicket,
  banMember,
  closeReport,
  liftBan,
  markContacted,
  OperatorRuleError,
  reinstateMember,
  rejectHandle,
  rejectTicket,
  setCafe,
  setStartTime,
  suspendMember,
} from "../social/operator.js";
import { ticketQueue } from "../social/tickets.js";
import { endOfDayIst, startOfDayIst } from "../utils/time.js";
import { isUuid } from "../utils/uuid.js";
import { type AdminFiles, signAdminLink } from "./files.js";
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

// ---- tickets, shows, cafes and handles ----

/** The body, read with a strict schema: a field the route does not know is a 400, and so is a reason outside the fixed list. */
function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw bad(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return parsed.data;
}

/** A link to an admin file route, or null when the admin has no store or secret to sign with. */
const fileLink = (files: AdminFiles | null, pathname: string, now: Date): string | null =>
  files === null ? null : signAdminLink(files, pathname, now);

export const ticketFilePath = (ticketId: string): string => `/api/tickets/${encodeURIComponent(ticketId)}/file`;
export const handlePhotoPath = (memberId: string): string => `/api/handles/${encodeURIComponent(memberId)}/photo`;

/** Pending tickets, the ones that run out of time first at the top. Duplicates are counts: no other member is named. */
export function listTickets(db: Database, files: AdminFiles | null, now: Date) {
  return {
    tickets: ticketQueue(db, now).map((item) => ({
      ...item,
      minutesLeft: Math.max(0, Math.floor((Date.parse(item.lockAt) - now.getTime()) / 60_000)),
      fileUrl: fileLink(files, ticketFilePath(item.ticketId), now),
    })),
  };
}

export type TicketFile = { key: string; mime: string };

/** The stored file of a ticket that still has one. */
export function ticketFile(db: Database, ticketId: string): TicketFile {
  const row = db
    .prepare("SELECT object_key AS key, mime FROM ticket_proof WHERE id = ? AND object_key IS NOT NULL")
    .get(ticketId) as TicketFile | null;
  if (!row) throw new HttpError(404, "no such ticket file");
  return row;
}

const rejectTicketBody = z.strictObject({ reason: ticketRejectReasonSchema });

const REVIEW_ERRORS = {
  not_found: new HttpError(404, "no such ticket"),
  not_pending: new HttpError(409, "this ticket is not waiting for an answer"),
  too_late: new HttpError(409, "the plan has passed T-24h, so the ticket can no longer be answered"),
} as const;

export function approveTicketAction(db: Database, ticketId: string, now: Date) {
  const result = approveTicket(db, ticketId, now);
  if (!result.ok) throw REVIEW_ERRORS[result.error];
  return { ticketId, status: result.ticket.status, planState: result.plan.state };
}

export function rejectTicketAction(db: Database, ticketId: string, body: unknown, now: Date) {
  const { reason } = parseBody(rejectTicketBody, body);
  const result = rejectTicket(db, ticketId, reason, now);
  if (!result.ok) throw REVIEW_ERRORS[result.error];
  return { ticketId, status: result.ticket.status, planState: result.plan.state };
}

/** Shows an operator may act on, with their pool and groups. */
export const listUpcomingShows = (db: Database, now: Date) => ({ shows: upcomingShows(db, now) });

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const startTimeBody = z.strictObject({
  startsAt: z
    .string()
    .refine(
      (v) => ISO_WITH_ZONE.test(v) && !Number.isNaN(Date.parse(v)),
      "must be a date and time with a zone, like 2026-11-10T19:30:00+05:30",
    ),
});

export function putStartTime(db: Database, eventId: string, body: unknown, now: Date) {
  const { startsAt } = parseBody(startTimeBody, body);
  const result = setStartTime(db, eventId, startsAt, now);
  if (result.ok) return { eventId, startsAt: result.startsAt };
  if (result.error === "not_found") throw new HttpError(404, "no such event");
  if (result.error === "too_late") throw new HttpError(409, "that start time is already inside the T-24h window");
  throw new HttpError(409, "a group for this show has locked, so its time can no longer change");
}

const cafeBody = z
  .strictObject({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(200).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
  })
  .refine((c) => (c.lat == null) === (c.lng == null), { message: "send both lat and lng, or neither", path: ["lat"] });

export function putCafe(db: Database, groupId: string, body: unknown, now: Date) {
  const cafe = parseBody(cafeBody, body);
  const result = setCafe(
    db,
    groupId,
    { name: cafe.name, address: cafe.address ?? null, lat: cafe.lat ?? null, lng: cafe.lng ?? null },
    now,
  );
  if (result.ok) return { groupId, cafeName: cafe.name };
  if (result.error === "not_found") throw new HttpError(404, "no such group");
  throw new HttpError(409, "this group has already met or been called off");
}

const PROFILE_URLS: Record<string, (handle: string) => string> = {
  instagram: (handle) => `https://www.instagram.com/${encodeURIComponent(handle)}/`,
  linkedin: (handle) => `https://www.linkedin.com/in/${encodeURIComponent(handle)}/`,
};

/** Handles waiting for a check. The operator opens the profile URL; the server never fetches either site. */
export function listHandles(db: Database, files: AdminFiles | null, params: URLSearchParams, now: Date) {
  enumParam(params, "status", ["pending"] as const);
  return {
    handles: pendingHandles(db).map(({ photoKey, ...h }) => ({
      ...h,
      profileUrl: PROFILE_URLS[h.kind]?.(h.handle) ?? null,
      photoUrl: photoKey === null ? null : fileLink(files, handlePhotoPath(h.memberId), now),
    })),
  };
}

/** The member's profile photo key, for the signed photo route. */
export function handlePhotoKey(db: Database, memberId: string): string {
  const row = db
    .prepare(
      "SELECT p.photo_key AS key FROM social_handle h JOIN profile p ON p.member_id = h.member_id WHERE h.member_id = ? AND h.status = 'pending' AND p.photo_key IS NOT NULL",
    )
    .get(memberId) as { key: string } | null;
  if (!row) throw new HttpError(404, "no such photo");
  return row.key;
}

const rejectHandleBody = z.strictObject({ reason: handleRejectReasonSchema });

const HANDLE_ERRORS = {
  not_found: new HttpError(404, "no such handle"),
  not_pending: new HttpError(409, "this handle is not waiting for a check"),
} as const;

export function approveHandleAction(db: Database, memberId: string, now: Date) {
  const result = approveHandle(db, memberId, now);
  if (!result.ok) throw HANDLE_ERRORS[result.error];
  return { memberId, status: "approved" as const };
}

export function rejectHandleAction(db: Database, memberId: string, body: unknown, now: Date) {
  const { reason } = parseBody(rejectHandleBody, body);
  const result = rejectHandle(db, memberId, reason, now);
  if (!result.ok) throw HANDLE_ERRORS[result.error];
  return { memberId, status: "rejected" as const, reason };
}

// ---- reports, accounts, bans and failed notices ----

/**
 * The ban pepper, or a 503: without the same BAN_PEPPER as the app, a number hashed here would never match one hashed there. The app
 * leaves a fingerprint of its pepper in the database; a different value here answers 503 the same as no value.
 */
function needPepper(db: Database, pepper: string | null | undefined): string {
  if (!pepper) throw new HttpError(503, "BAN_PEPPER is not set on the admin process");
  if (pepperCheck(db, pepper) === "mismatch") throw new HttpError(503, "BAN_PEPPER on the admin process is not the app's value");
  return pepper;
}

/** Deletes the files an erased account pointed at. A miss is left for the app's nightly sweep, which removes any file no row points at. */
async function deleteStored(files: AdminFiles | null, keys: readonly string[]): Promise<void> {
  if (files === null) return;
  for (const key of keys) await files.store.delete(key).catch(() => {});
}

export const listReports = (db: Database, now: Date) => ({ reports: reportQueue(db, now) });

const REPORT_ERRORS = {
  not_found: new HttpError(404, "no such report"),
  already_closed: new HttpError(409, "this report is already closed"),
} as const;

export function contactedAction(db: Database, reportId: string, now: Date) {
  const result = markContacted(db, reportId, now);
  if (!result.ok) throw REPORT_ERRORS[result.error];
  return { reportId, contacted: true as const };
}

const closeReportBody = z.strictObject({
  outcome: z.enum(["upheld", "dismissed"]),
  /** Kept on the report row for the year it is retained. It never goes into the operator's action log. */
  note: z.string().trim().min(1).max(2000),
});

export async function closeReportAction(
  db: Database,
  pepper: string | null | undefined,
  files: AdminFiles | null,
  reportId: string,
  body: unknown,
  now: Date,
) {
  const { outcome, note } = parseBody(closeReportBody, body);
  let result: ReturnType<typeof closeReport>;
  try {
    result = closeReport(db, needPepper(db, pepper), reportId, outcome, note, now, DEFAULT_TUNABLES);
  } catch (error) {
    if (error instanceof OperatorRuleError) throw new HttpError(409, "contact the reporter first, then mark it contacted");
    throw error;
  }
  if (!result.ok) throw REPORT_ERRORS[result.error];
  await deleteStored(files, result.fileKeys);
  return { reportId, status: "closed" as const, outcome };
}

export function getAccount(db: Database, memberId: string) {
  const account = accountDetail(db, memberId);
  if (account === null) throw new HttpError(404, "no such account");
  return account;
}

const ACCOUNT_ERRORS = {
  not_found: new HttpError(404, "no such account"),
  not_allowed: new HttpError(409, "that is not possible from this account's current state"),
} as const;

export function suspendAction(db: Database, memberId: string, now: Date) {
  const result = suspendMember(db, memberId, now, DEFAULT_TUNABLES);
  if (!result.ok) throw ACCOUNT_ERRORS[result.error];
  return { memberId, status: "suspended" as const };
}

export function reinstateAction(db: Database, pepper: string | null | undefined, memberId: string, now: Date) {
  const result = reinstateMember(db, needPepper(db, pepper), memberId, now);
  if (!result.ok) {
    throw result.error === "not_allowed"
      ? new HttpError(409, "only a suspended or stopped account can be reinstated, and not while a report about it is open")
      : ACCOUNT_ERRORS.not_found;
  }
  return { memberId, status: (accountDetail(db, memberId)?.status ?? "active") as string };
}

export async function banAction(db: Database, pepper: string | null | undefined, files: AdminFiles | null, memberId: string, now: Date) {
  const result = banMember(db, needPepper(db, pepper), memberId, now, DEFAULT_TUNABLES);
  if (!result.ok) throw ACCOUNT_ERRORS.not_found;
  await deleteStored(files, result.fileKeys);
  return { memberId, status: "banned" as const };
}

const liftBody = z.strictObject({ phone: z.string().trim().min(1).max(32) });
const E164 = /^\+[1-9]\d{6,14}$/;

/** The number the operator typed, as E.164: an Indian mobile in any common form, or any number already written as +country digits. */
const operatorPhone = (raw: string): string | null => {
  const compact = raw.replace(/[\s\-().]/g, "");
  return E164.test(compact) ? compact : normalizePhone(raw);
};

export function liftBanAction(db: Database, pepper: string | null | undefined, body: unknown, now: Date) {
  const { phone } = parseBody(liftBody, body);
  const e164 = operatorPhone(phone);
  if (e164 === null) throw bad("phone is not a number this service can hold, send it as +91 and ten digits");
  if (!liftBan(db, needPepper(db, pepper), e164, now).ok) throw new HttpError(404, "that number is not on the ban list");
  return { lifted: true as const };
}

export function listFailedNotices(db: Database, params: URLSearchParams) {
  enumParam(params, "status", ["failed"] as const);
  return { notices: failedNotices(db) };
}
