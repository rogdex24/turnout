import type { Database } from "bun:sqlite";
import type { HandleRejectReason } from "@turnout/contract/profile";
import type { TicketRejectReason } from "@turnout/contract/ticket";
import { ulid } from "../utils/ulid.js";
import { banReason, removeBan } from "./bans.js";
import { eraseMember } from "./deletion.js";
import { REINSTATE_ACTION } from "./feedback.js";
import { type GroupRow, getGroup, runGroupingPass } from "./groups.js";
import { getHandle } from "./handles.js";
import { getMember } from "./members.js";
import { joinUntil } from "./model/eligibility.js";
import { meetAt } from "./model/schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { addNotice } from "./notices.js";
import { getReport, removeFromGroups } from "./reports.js";
import { type ReviewResult, reviewTicket } from "./tickets.js";

/**
 * Every write the operator makes goes through here, and each one leaves an `operator_action` row in the same transaction as the
 * change. The detail holds codes and times, never free text about a person.
 */
export function recordAction(
  db: Database,
  action: {
    action: string;
    subjectType: "ticket" | "event" | "group" | "member" | "report" | "ban";
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

/** Raised when a rule the operator's own tools must keep would be broken. Nothing was written. */
export class OperatorRuleError extends Error {
  constructor(
    readonly code: "contact_required",
    message: string,
  ) {
    super(message);
    this.name = "OperatorRuleError";
  }
}

export type ReportActionResult = { ok: true } | { ok: false; error: "not_found" | "already_closed" };

/**
 * Records that the operator has been in touch with the person who made the report. A report by a woman about a man cannot be
 * closed until this is done. A second call changes nothing and writes no second action.
 */
export function markContacted(db: Database, reportId: string, now: Date): ReportActionResult {
  return db
    .transaction((): ReportActionResult => {
      const report = getReport(db, reportId);
      if (report === null) return { ok: false, error: "not_found" };
      if (report.status === "closed") return { ok: false, error: "already_closed" };
      const changed = db
        .query("UPDATE report SET contacted_reporter_at = ? WHERE id = ? AND contacted_reporter_at IS NULL")
        .run(now.toISOString(), reportId).changes;
      if (changed > 0) recordAction(db, { action: "report_contacted", subjectType: "report", subjectId: reportId, now });
      return { ok: true };
    })
    .immediate();
}

export type CloseReportResult = { ok: true; fileKeys: string[] } | { ok: false; error: "not_found" | "already_closed" };

/**
 * Closes a report. A report by a woman about a man is refused (throws `OperatorRuleError`) until the reporter has been contacted,
 * unless the reporter has erased their account: there is nobody left to contact.
 *
 * Upheld: the number goes on the ban list as `report_upheld` and the account is erased in the same transaction; the returned file
 * keys are for the caller to delete after the commit. Dismissed: the account goes back to what it was before the report, but only
 * when no other report about the same person is still open; plans that were withdrawn stay withdrawn. The note is kept on the
 * report; the action row holds the outcome code only.
 */
export function closeReport(
  db: Database,
  pepper: string,
  reportId: string,
  outcome: "upheld" | "dismissed",
  note: string | null,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): CloseReportResult {
  return db
    .transaction((): CloseReportResult => {
      const report = getReport(db, reportId);
      if (report === null) return { ok: false, error: "not_found" };
      if (report.status === "closed") return { ok: false, error: "already_closed" };
      const reporter = getMember(db, report.reporter_id);
      const reporterDeleted = reporter === null || reporter.status === "deleted";
      if (
        report.reporter_gender === "woman" &&
        report.subject_gender === "man" &&
        report.contacted_reporter_at === null &&
        !reporterDeleted
      ) {
        throw new OperatorRuleError("contact_required", "contact the person who made this report before closing it");
      }
      const at = now.toISOString();
      db.query("UPDATE report SET status = 'closed', outcome = ?, closed_at = ?, close_note = ? WHERE id = ?").run(
        outcome,
        at,
        note,
        reportId,
      );
      recordAction(db, { action: "report_close", subjectType: "report", subjectId: reportId, detail: { outcome }, now });
      let fileKeys: string[] = [];
      if (outcome === "upheld") {
        const erased = eraseMember(db, report.subject_id, { kind: "ban", pepper, reason: "report_upheld" }, now, t);
        if (erased.ok) fileKeys = erased.fileKeys;
      } else {
        const others = db.query("SELECT 1 FROM report WHERE subject_id = ? AND status = 'open'").get(report.subject_id);
        const member = getMember(db, report.subject_id);
        if (others === null && member !== null && member.status === "suspended" && member.status_reason === "report") {
          if (report.subject_status_before === "active") {
            db.query("UPDATE member SET status = 'active', status_reason = NULL, updated_at = ? WHERE id = ?").run(at, member.id);
          } else if (report.subject_status_before === "stopped") {
            db.query("UPDATE member SET status = 'stopped', status_reason = 'downvote_stop', updated_at = ? WHERE id = ?").run(
              at,
              member.id,
            );
          }
        }
      }
      return { ok: true, fileKeys };
    })
    .immediate();
}

export type AccountActionResult = { ok: true } | { ok: false; error: "not_found" | "not_allowed" };

/** Suspends an active or stopped member: signed out, plans withdrawn, out of done groups. They get a 403 until reinstated. */
export function suspendMember(db: Database, memberId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): AccountActionResult {
  return db
    .transaction((): AccountActionResult => {
      const member = getMember(db, memberId);
      if (member === null || member.status === "deleted") return { ok: false, error: "not_found" };
      if (member.status !== "active" && member.status !== "stopped") return { ok: false, error: "not_allowed" };
      db.query("UPDATE member SET status = 'suspended', status_reason = 'operator', updated_at = ? WHERE id = ?").run(
        now.toISOString(),
        memberId,
      );
      removeFromGroups(db, memberId, now, t);
      recordAction(db, { action: "member_suspend", subjectType: "member", subjectId: memberId, now });
      return { ok: true };
    })
    .immediate();
}

/**
 * Puts a suspended or stopped member back to active. A member with an open report is refused: the report has to be closed first.
 * A stopped member's `downvote_stop` row leaves the ban list, and the action row this writes is the point the stop rule counts
 * downvotes from. A suspended member whose number is still listed as a stop (the operator suspended them while stopped) goes back
 * to `stopped`. Withdrawn plans stay withdrawn.
 */
export function reinstateMember(db: Database, pepper: string, memberId: string, now: Date): AccountActionResult {
  return db
    .transaction((): AccountActionResult => {
      const member = getMember(db, memberId);
      if (member === null || member.status === "deleted") return { ok: false, error: "not_found" };
      if (member.status !== "suspended" && member.status !== "stopped") return { ok: false, error: "not_allowed" };
      if (db.query("SELECT 1 FROM report WHERE subject_id = ? AND status = 'open'").get(memberId) !== null) {
        return { ok: false, error: "not_allowed" };
      }
      const phone = member.phone_e164;
      const stopListed = phone !== null && banReason(db, pepper, phone) === "downvote_stop";
      const at = now.toISOString();
      if (member.status === "suspended" && stopListed) {
        db.query("UPDATE member SET status = 'stopped', status_reason = 'downvote_stop', updated_at = ? WHERE id = ?").run(at, memberId);
      } else {
        if (member.status === "stopped" && stopListed) removeBan(db, pepper, phone);
        db.query("UPDATE member SET status = 'active', status_reason = NULL, updated_at = ? WHERE id = ?").run(at, memberId);
      }
      recordAction(db, { action: REINSTATE_ACTION, subjectType: "member", subjectId: memberId, now });
      return { ok: true };
    })
    .immediate();
}

export type BanMemberResult = { ok: true; fileKeys: string[] } | { ok: false; error: "not_found" };

/** Bans a member: the number goes on the ban list as `operator` and the account is erased. The caller deletes the returned files after the commit. */
export function banMember(db: Database, pepper: string, memberId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): BanMemberResult {
  return db
    .transaction((): BanMemberResult => {
      const erased = eraseMember(db, memberId, { kind: "ban", pepper, reason: "operator" }, now, t);
      if (!erased.ok) return erased;
      recordAction(db, { action: "member_ban", subjectType: "member", subjectId: memberId, now });
      return { ok: true, fileKeys: erased.fileKeys };
    })
    .immediate();
}

/** Takes a number off the ban list, whatever the reason. The number is hashed inside; the action row holds no number and no hash. */
export function liftBan(db: Database, pepper: string, e164: string, now: Date): { ok: boolean } {
  return db
    .transaction(() => {
      const removed = removeBan(db, pepper, e164);
      if (removed) recordAction(db, { action: "ban_lift", subjectType: "ban", subjectId: "ban_list", now });
      return { ok: removed };
    })
    .immediate();
}
