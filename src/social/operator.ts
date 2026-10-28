import type { Database } from "bun:sqlite";
import type { HandleRejectReason } from "@turnout/contract/profile";
import type { TicketRejectReason } from "@turnout/contract/ticket";
import { ulid } from "../utils/ulid.js";
import { type GroupRow, getGroup, runGroupingPass } from "./groups.js";
import { getHandle } from "./handles.js";
import { joinUntil } from "./model/eligibility.js";
import { meetAt } from "./model/schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { addNotice } from "./notices.js";
import { type ReviewResult, reviewTicket } from "./tickets.js";

/**
 * Every write the operator makes goes through here, and each one leaves an `operator_action` row in the same transaction as the
 * change. The detail holds codes and times, never free text about a person.
 */
export function recordAction(
  db: Database,
  action: {
    action: string;
    subjectType: "ticket" | "event" | "group" | "member";
    subjectId: string;
    detail?: Record<string, string | number | null>;
    now: Date;
  },
): void {
  db.query("INSERT INTO operator_action (id, action, subject_type, subject_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    ulid(action.now),
    action.action,
    action.subjectType,
    action.subjectId,
    action.detail === undefined ? null : JSON.stringify(action.detail),
    action.now.toISOString(),
  );
}

const OPERATOR = "operator";

export function approveTicket(db: Database, ticketId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): ReviewResult {
  return db
    .transaction((): ReviewResult => {
      const result = reviewTicket(db, { ticketId, decision: { kind: "approve" }, reviewer: OPERATOR, now }, t);
      if (result.ok) recordAction(db, { action: "ticket_approve", subjectType: "ticket", subjectId: ticketId, now });
      return result;
    })
    .immediate();
}

export function rejectTicket(
  db: Database,
  ticketId: string,
  reason: TicketRejectReason,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): ReviewResult {
  return db
    .transaction((): ReviewResult => {
      const result = reviewTicket(db, { ticketId, decision: { kind: "reject", reason }, reviewer: OPERATOR, now }, t);
      if (result.ok) recordAction(db, { action: "ticket_reject", subjectType: "ticket", subjectId: ticketId, detail: { reason }, now });
      return result;
    })
    .immediate();
}

export type StartTimeResult = { ok: true; startsAt: string } | { ok: false; error: "not_found" | "too_late" | "group_locked" };

/**
 * Sets the show's start time (it also makes a date-only show timed). The plans and the groups that have not locked take the new time
 * with it, and so do their meet times. It is refused when the new T-24h has already passed, and once any group for the show has locked.
 */
export function setStartTime(db: Database, eventId: string, startsAt: string, now: Date, t: Tunables = DEFAULT_TUNABLES): StartTimeResult {
  return db
    .transaction((): StartTimeResult => {
      const event = db.query("SELECT id FROM event WHERE id = ? AND status != 'delisted'").get(eventId);
      if (event === null) return { ok: false, error: "not_found" };
      const at = new Date(startsAt).toISOString();
      if (now.getTime() >= Date.parse(joinUntil(at, t))) return { ok: false, error: "too_late" };
      if (db.query("SELECT 1 FROM show_group WHERE event_id = ? AND state IN ('locked', 'live', 'done') LIMIT 1").get(eventId) !== null) {
        return { ok: false, error: "group_locked" };
      }
      const nowIso = now.toISOString();
      db.query(
        `INSERT INTO start_override (event_id, starts_at, set_by, set_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET starts_at = excluded.starts_at, set_by = excluded.set_by, set_at = excluded.set_at`,
      ).run(eventId, at, OPERATOR, nowIso);
      db.query(
        "UPDATE plan SET show_starts_at = ?, updated_at = ? WHERE event_id = ? AND state IN ('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group', 'group_confirmed')",
      ).run(at, nowIso, eventId);
      db.query("UPDATE show_group SET starts_at = ?, meet_at = ?, updated_at = ? WHERE event_id = ? AND state = 'confirmed'").run(
        at,
        meetAt(at, t),
        nowIso,
        eventId,
      );
      recordAction(db, { action: "set_start_time", subjectType: "event", subjectId: eventId, detail: { startsAt: at }, now });
      return { ok: true, startsAt: at };
    })
    .immediate();
}

export interface CafeInput {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export type CafeResult = { ok: true; group: GroupRow } | { ok: false; error: "not_found" | "group_closed" };

/** Names where a group meets. Only a group that has not met yet takes one. */
export function setCafe(db: Database, groupId: string, cafe: CafeInput, now: Date): CafeResult {
  return db
    .transaction((): CafeResult => {
      const group = getGroup(db, groupId);
      if (group === null) return { ok: false, error: "not_found" };
      if (group.state !== "confirmed" && group.state !== "locked" && group.state !== "live") return { ok: false, error: "group_closed" };
      db.query("UPDATE show_group SET cafe_name = ?, cafe_address = ?, cafe_lat = ?, cafe_lng = ?, updated_at = ? WHERE id = ?").run(
        cafe.name,
        cafe.address,
        cafe.lat,
        cafe.lng,
        now.toISOString(),
        groupId,
      );
      recordAction(db, { action: "set_cafe", subjectType: "group", subjectId: groupId, now });
      return { ok: true, group: getGroup(db, groupId) as GroupRow };
    })
    .immediate();
}

export type HandleReviewResult = { ok: true } | { ok: false; error: "not_found" | "not_pending" };

/** The shows this member is waiting on, for the grouping pass an approval triggers. */
const waitingShows = (db: Database, memberId: string): string[] =>
  (
    db.query("SELECT DISTINCT event_id FROM plan WHERE member_id = ? AND state = 'finding_group'").all(memberId) as { event_id: string }[]
  ).map((r) => r.event_id);

/** Approves a pending handle. The member's waiting plans get a grouping pass at once, so an approval can place them without a wait for the ticker. */
export function approveHandle(db: Database, memberId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): HandleReviewResult {
  return db
    .transaction((): HandleReviewResult => {
      if (getHandle(db, memberId) === null) return { ok: false, error: "not_found" };
      const at = now.toISOString();
      const changed = db
        .query(
          "UPDATE social_handle SET status = 'approved', reject_reason = NULL, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE member_id = ? AND status = 'pending'",
        )
        .run(at, OPERATOR, at, memberId).changes;
      if (changed !== 1) return { ok: false, error: "not_pending" };
      recordAction(db, { action: "handle_approve", subjectType: "member", subjectId: memberId, now });
      for (const eventId of waitingShows(db, memberId)) runGroupingPass(db, eventId, now, t);
      return { ok: true };
    })
    .immediate();
}

/** Rejects a pending handle with a fixed reason. The member gets a notice and fixes the handle; the reason stays on their record. */
export function rejectHandle(
  db: Database,
  memberId: string,
  reason: HandleRejectReason,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): HandleReviewResult {
  return db
    .transaction((): HandleReviewResult => {
      const handle = getHandle(db, memberId);
      if (handle === null) return { ok: false, error: "not_found" };
      const at = now.toISOString();
      const changed = db
        .query(
          "UPDATE social_handle SET status = 'rejected', reject_reason = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE member_id = ? AND status = 'pending'",
        )
        .run(reason, at, OPERATOR, at, memberId).changes;
      if (changed !== 1) return { ok: false, error: "not_pending" };
      recordAction(db, { action: "handle_reject", subjectType: "member", subjectId: memberId, detail: { reason }, now });
      addNotice(
        db,
        {
          memberId,
          kind: "handle_rejected",
          planId: null,
          groupId: null,
          dedupeKey: `handle_rejected:${memberId}:${handle.submitted_at}`,
          now,
        },
        t,
      );
      return { ok: true };
    })
    .immediate();
}
