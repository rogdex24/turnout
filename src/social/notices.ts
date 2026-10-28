import type { Database } from "bun:sqlite";
import type { NoticeKind } from "@turnout/contract/app/notices";
import { ulid } from "../utils/ulid.js";
import { addMinutes } from "./dates.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";

export type NoticePushState = "pending" | "sending" | "sent" | "stale" | "no_device" | "not_sent";

export interface NoticeRow {
  id: string;
  member_id: string;
  kind: NoticeKind;
  plan_id: string | null;
  group_id: string | null;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
  stale_after: string;
  push_state: NoticePushState;
  claimed_at: string | null;
  pushed_at: string | null;
}

export interface NewNotice {
  memberId: string;
  kind: NoticeKind;
  planId: string | null;
  groupId: string | null;
  /** One per milestone: asking twice for the same key adds nothing. Built from ids and the milestone, never from a name. */
  dedupeKey: string;
  now: Date;
}

/**
 * Adds a notice, in the same transaction as the change it reports. Returns its id, or null when this milestone already has one.
 * The notice holds the recipient's own ids and the kind: nothing about another member, and no reason.
 */
export function addNotice(db: Database, notice: NewNotice, t: Tunables = DEFAULT_TUNABLES): string | null {
  const id = ulid(notice.now);
  const result = db
    .query(
      `INSERT OR IGNORE INTO notice (id, member_id, kind, plan_id, group_id, dedupe_key, created_at, stale_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      notice.memberId,
      notice.kind,
      notice.planId,
      notice.groupId,
      notice.dedupeKey,
      notice.now.toISOString(),
      addMinutes(notice.now, t.noticeStaleMinutes[notice.kind]).toISOString(),
    );
  return result.changes === 1 ? id : null;
}

export const NOTICE_PAGE = 100;

/** The member's notices newer than `after`, oldest first. Past the staleness mark a notice is still listed. */
export function listNotices(db: Database, memberId: string, after: string | undefined, limit = NOTICE_PAGE): NoticeRow[] {
  return db
    .query("SELECT * FROM notice WHERE member_id = ? AND id > ? ORDER BY id LIMIT ?")
    .all(memberId, after ?? "", limit) as NoticeRow[];
}

/** Marks the member's notices up to and including `upTo` as read. Returns how many were newly marked. */
export function markNoticesRead(db: Database, memberId: string, upTo: string, now: Date): number {
  return db
    .query("UPDATE notice SET read_at = ? WHERE member_id = ? AND id <= ? AND read_at IS NULL")
    .run(now.toISOString(), memberId, upTo).changes;
}

export function getNotice(db: Database, id: string): NoticeRow | null {
  return db.query("SELECT * FROM notice WHERE id = ?").get(id) as NoticeRow | null;
}
