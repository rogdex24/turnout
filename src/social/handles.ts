import type { Database } from "bun:sqlite";
import type { HandleKind, HandleRejectReason } from "@turnout/contract/profile";
import { istCalendarDate } from "../utils/time.js";

export interface HandleRow {
  member_id: string;
  kind: HandleKind;
  handle: string;
  status: "pending" | "approved" | "rejected";
  reject_reason: HandleRejectReason | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  submissions_today: number;
  submissions_day: string;
  updated_at: string;
}

export function getHandle(db: Database, memberId: string): HandleRow | null {
  return db.query("SELECT * FROM social_handle WHERE member_id = ?").get(memberId) as HandleRow | null;
}

/**
 * Saves a handle for review: the state becomes `pending`, whatever it was. `limit` submits are allowed per IST day; the call
 * returns false when that many have been made today (nothing is changed then).
 */
export function submitHandle(db: Database, memberId: string, kind: HandleKind, handle: string, now: Date, limit: number): boolean {
  const day = istCalendarDate(now);
  const at = now.toISOString();
  return db.transaction(() => {
    const row = getHandle(db, memberId);
    if (row === null) {
      db.query(
        "INSERT INTO social_handle (member_id, kind, handle, status, submitted_at, submissions_today, submissions_day, updated_at) VALUES (?, ?, ?, 'pending', ?, 1, ?, ?)",
      ).run(memberId, kind, handle, at, day, at);
      return true;
    }
    const today = row.submissions_day === day ? row.submissions_today : 0;
    if (today >= limit) return false;
    db.query(
      `UPDATE social_handle SET kind = ?, handle = ?, status = 'pending', reject_reason = NULL, submitted_at = ?, reviewed_at = NULL, reviewed_by = NULL,
         submissions_today = ?, submissions_day = ?, updated_at = ? WHERE member_id = ?`,
    ).run(kind, handle, at, today + 1, day, at, memberId);
    return true;
  })();
}

/** A new photo means the reviewer has to look at the handle again: an approved handle goes back to `pending`. */
export function resetApprovedHandle(db: Database, memberId: string, now: Date): boolean {
  const at = now.toISOString();
  return (
    db
      .query(
        "UPDATE social_handle SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL, submitted_at = ?, updated_at = ? WHERE member_id = ? AND status = 'approved'",
      )
      .run(at, at, memberId).changes > 0
  );
}

/**
 * True while the member is in a confirmed or locked group, when the handle may not change. Groups arrive in M3 (the `group_member`
 * table); until then nobody is in one, so this is false. M3 replaces the body and the callers stay as they are.
 */
export function isInLockedGroup(_db: Database, _memberId: string): boolean {
  return false;
}
