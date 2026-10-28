import type { Database } from "bun:sqlite";
import type { TicketRejectReason, TicketState } from "@turnout/contract/ticket";
import { ulid } from "../utils/ulid.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { addNotice } from "./notices.js";
import { movePlan, type PlanRow, planLockAt } from "./plans.js";

export interface TicketRow {
  id: string;
  plan_id: string;
  object_key: string | null;
  mime: string;
  bytes: number;
  sha256: string | null;
  status: TicketState;
  reject_reason: TicketRejectReason | null;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  file_deleted_at: string | null;
}

export function getTicket(db: Database, id: string): TicketRow | null {
  return db.query("SELECT * FROM ticket_proof WHERE id = ?").get(id) as TicketRow | null;
}

/** The newest file sent for the plan. */
export function latestTicket(db: Database, planId: string): TicketRow | null {
  return db
    .query("SELECT * FROM ticket_proof WHERE plan_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1")
    .get(planId) as TicketRow | null;
}

export type AddTicketResult = { ok: true; ticket: TicketRow } | { ok: false; error: "too_late" | "plan_closed" };

/**
 * Records a stored file as the plan's ticket and moves the plan to `checking_ticket`. A file can be sent while the plan needs one or
 * after a rejection, and only before T-24h. The file's bytes are already in the store: the caller deletes them when this says no.
 */
export function addTicket(
  db: Database,
  input: { plan: PlanRow; objectKey: string; mime: string; bytes: number; sha256: string; now: Date },
  t: Tunables = DEFAULT_TUNABLES,
): AddTicketResult {
  return db
    .transaction((): AddTicketResult => {
      if (input.now.getTime() >= Date.parse(planLockAt(input.plan, t))) return { ok: false, error: "too_late" };
      const moved =
        input.plan.state === "needs_ticket" || input.plan.state === "ticket_rejected"
          ? movePlan(db, input.plan, { type: "ticket_uploaded" }, input.now)
          : null;
      if (moved === null) return { ok: false, error: "plan_closed" };
      const id = ulid(input.now);
      db.query(
        "INSERT INTO ticket_proof (id, plan_id, object_key, mime, bytes, sha256, status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
      ).run(id, input.plan.id, input.objectKey, input.mime, input.bytes, input.sha256, input.now.toISOString());
      return { ok: true, ticket: getTicket(db, id) as TicketRow };
    })
    .immediate();
}

export type TicketDecision = { kind: "approve" } | { kind: "reject"; reason: TicketRejectReason };

export type ReviewResult =
  | { ok: true; ticket: TicketRow; plan: PlanRow; eventId: string }
  | { ok: false; error: "not_found" | "not_pending" | "too_late" };

/**
 * The operator's answer to a ticket. It must be the plan's pending file, with the plan in `checking_ticket`, and before T-24h: after
 * that the plan is ending as `late_review` and an approval would promise a group that cannot form. Both rows change with a one-row
 * check, the plan moves, and the member's notice goes in the same transaction. Two operators answering at once change one row.
 */
export function reviewTicket(
  db: Database,
  input: { ticketId: string; decision: TicketDecision; reviewer: string; now: Date },
  t: Tunables = DEFAULT_TUNABLES,
): ReviewResult {
  return db.transaction((): ReviewResult => {
    const ticket = getTicket(db, input.ticketId);
    if (ticket === null) return { ok: false, error: "not_found" };
    const plan = db.query("SELECT * FROM plan WHERE id = ?").get(ticket.plan_id) as PlanRow;
    if (ticket.status !== "pending" || plan.state !== "checking_ticket") return { ok: false, error: "not_pending" };
    if (input.now.getTime() >= Date.parse(planLockAt(plan, t))) return { ok: false, error: "too_late" };
    const at = input.now.toISOString();
    const approve = input.decision.kind === "approve";
    const changed = db
      .query("UPDATE ticket_proof SET status = ?, reject_reason = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'pending'")
      .run(
        approve ? "approved" : "rejected",
        input.decision.kind === "reject" ? input.decision.reason : null,
        at,
        input.reviewer,
        ticket.id,
      ).changes;
    if (changed !== 1) return { ok: false, error: "not_pending" };
    const moved = movePlan(db, plan, { type: approve ? "ticket_approved" : "ticket_rejected" }, input.now);
    if (moved === null) throw new Error("the plan moved while its ticket was reviewed");
    addNotice(
      db,
      {
        memberId: plan.member_id,
        kind: approve ? "ticket_approved" : "ticket_rejected",
        planId: plan.id,
        groupId: null,
        dedupeKey: `${approve ? "ticket_approved" : "ticket_rejected"}:${ticket.id}`,
        now: input.now,
      },
      t,
    );
    return { ok: true, ticket: getTicket(db, ticket.id) as TicketRow, plan: moved, eventId: plan.event_id };
  })();
}

export interface QueueItem {
  ticketId: string;
  planId: string;
  eventId: string;
  showTitle: string;
  showStartsAt: string;
  mime: string;
  bytes: number;
  uploadedAt: string;
  /** T-24h: the last moment to answer. */
  lockAt: string;
  /** Other members' tickets for this show with the same file. Counts only: no one is named. */
  duplicates: number;
}

/** Tickets waiting for the operator, the ones that run out of time first at the top. */
export function ticketQueue(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): QueueItem[] {
  const rows = db
    .query(
      `SELECT tp.id AS ticketId, tp.plan_id AS planId, p.event_id AS eventId, p.show_title AS showTitle, p.show_starts_at AS showStartsAt,
              tp.mime, tp.bytes, tp.uploaded_at AS uploadedAt, tp.sha256, p.member_id AS memberId, p.dedupe_key AS dedupeKey
       FROM ticket_proof tp JOIN plan p ON p.id = tp.plan_id
       WHERE tp.status = 'pending' AND p.state = 'checking_ticket' AND tp.object_key IS NOT NULL
       ORDER BY p.show_starts_at, tp.uploaded_at, tp.id`,
    )
    .all() as (Omit<QueueItem, "lockAt" | "duplicates"> & { sha256: string | null; memberId: string; dedupeKey: string })[];
  const count = db.query(
    `SELECT COUNT(DISTINCT p.member_id) AS n FROM ticket_proof tp JOIN plan p ON p.id = tp.plan_id
     WHERE tp.sha256 = ? AND p.dedupe_key = ? AND p.member_id != ?`,
  );
  return rows
    .map(({ sha256, memberId, dedupeKey, ...item }) => ({
      ...item,
      lockAt: planLockAt({ show_starts_at: item.showStartsAt }, t),
      duplicates: sha256 === null ? 0 : (count.get(sha256, dedupeKey, memberId) as { n: number }).n,
    }))
    .filter((item) => Date.parse(item.lockAt) > now.getTime());
}

/** A ticket file due for deletion, with the row to mark once the store has dropped it. */
export interface DueTicketFile {
  ticketId: string;
  objectKey: string;
}

/**
 * Ticket files that must not be kept any longer: at once when the plan was withdrawn, 24 hours after a rejection nobody answered with
 * a new file (a rejected file that a newer one replaced goes at once), and 24 hours after the show starts whatever happened.
 */
export function dueTicketFiles(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): DueTicketFile[] {
  const rows = db
    .query(
      `SELECT tp.id AS ticketId, tp.object_key AS objectKey, tp.status, tp.reviewed_at AS reviewedAt, p.state AS planState,
              p.show_starts_at AS startsAt,
              EXISTS (SELECT 1 FROM ticket_proof newer WHERE newer.plan_id = tp.plan_id AND (newer.uploaded_at, newer.id) > (tp.uploaded_at, tp.id)) AS superseded
       FROM ticket_proof tp JOIN plan p ON p.id = tp.plan_id
       WHERE tp.object_key IS NOT NULL ORDER BY tp.uploaded_at, tp.id`,
    )
    .all() as {
    ticketId: string;
    objectKey: string;
    status: TicketState;
    reviewedAt: string | null;
    planState: string;
    startsAt: string;
    superseded: number;
  }[];
  const hour = 60 * 60 * 1000;
  return rows
    .filter((r) => {
      if (r.planState === "withdrawn") return true;
      if (now.getTime() >= Date.parse(r.startsAt) + t.plan.ticketDeleteHoursAfterStart * hour) return true;
      if (r.status !== "rejected") return false;
      return (
        r.superseded === 1 || (r.reviewedAt !== null && now.getTime() >= Date.parse(r.reviewedAt) + t.plan.rejectedTicketDeleteHours * hour)
      );
    })
    .map(({ ticketId, objectKey }) => ({ ticketId, objectKey }));
}

/** The store has dropped the file: forget its key and hash, keep the row as the record that a ticket was seen. */
export function markTicketFileDeleted(db: Database, ticketId: string, now: Date): void {
  db.query("UPDATE ticket_proof SET object_key = NULL, sha256 = NULL, file_deleted_at = ? WHERE id = ? AND object_key IS NOT NULL").run(
    now.toISOString(),
    ticketId,
  );
}

/** Every ticket file key a row points at, for the sweep that removes files no row owns. */
export function allTicketKeys(db: Database): Set<string> {
  return new Set(
    (db.query("SELECT object_key FROM ticket_proof WHERE object_key IS NOT NULL").all() as { object_key: string }[]).map(
      (r) => r.object_key,
    ),
  );
}
