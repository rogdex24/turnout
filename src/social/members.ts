import type { Database } from "bun:sqlite";
import { ulid } from "../utils/ulid.js";

export type MemberStatus = "active" | "suspended" | "stopped" | "banned" | "deleted";

export interface MemberRow {
  id: string;
  phone_e164: string | null;
  status: MemberStatus;
  status_reason: string | null;
  phone_verified_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function getMember(db: Database, id: string): MemberRow | null {
  return db.query("SELECT * FROM member WHERE id = ?").get(id) as MemberRow | null;
}

export function getMemberByPhone(db: Database, phone: string): MemberRow | null {
  return db.query("SELECT * FROM member WHERE phone_e164 = ?").get(phone) as MemberRow | null;
}

/**
 * True when this number belongs to a banned member. A live member's number is never on the ban list for a refusing reason (a ban erases
 * the account), so the member's own status is the whole answer here; the list is read in `bans.ts` for numbers with no account.
 */
export function isPhoneBanned(db: Database, phone: string): boolean {
  return db.query("SELECT 1 FROM member WHERE phone_e164 = ? AND status = 'banned'").get(phone) !== null;
}

/**
 * A new member with an empty profile row. The caller has just proved the phone with a code. `stopped` makes the account start as
 * `stopped` (the number is on the ban list for `downvote_stop`), so it can sign in and browse but is never put in a group.
 */
export function createMember(db: Database, phone: string, now: Date, stopped = false): MemberRow {
  const at = now.toISOString();
  const id = ulid(now);
  db.transaction(() => {
    db.query(
      "INSERT INTO member (id, phone_e164, status, status_reason, phone_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, phone, stopped ? "stopped" : "active", stopped ? "downvote_stop" : null, at, at, at);
    db.query("INSERT INTO profile (member_id, group_pref, created_at, updated_at) VALUES (?, 'open', ?, ?)").run(id, at, at);
  })();
  return getMember(db, id) as MemberRow;
}

export function markPhoneVerified(db: Database, memberId: string, now: Date): void {
  const at = now.toISOString();
  db.query("UPDATE member SET phone_verified_at = ?, updated_at = ? WHERE id = ?").run(at, at, memberId);
}

export interface ConsentRow {
  notice_version: string;
  given_at: string;
}

/** Records that the member agreed to this notice version. Once per version: asking again returns the first record. */
export function recordConsent(db: Database, memberId: string, noticeVersion: string, now: Date): ConsentRow {
  db.query("INSERT OR IGNORE INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES (?, ?, ?, 'service', ?)").run(
    ulid(now),
    memberId,
    noticeVersion,
    now.toISOString(),
  );
  return db
    .query("SELECT notice_version, given_at FROM consent_record WHERE member_id = ? AND notice_version = ? AND purpose = 'service'")
    .get(memberId, noticeVersion) as ConsentRow;
}

/** The newest agreement still in force, or null when the member has none. */
export function latestConsent(db: Database, memberId: string): ConsentRow | null {
  return db
    .query(
      "SELECT notice_version, given_at FROM consent_record WHERE member_id = ? AND purpose = 'service' AND withdrawn_at IS NULL ORDER BY given_at DESC, id DESC LIMIT 1",
    )
    .get(memberId) as ConsentRow | null;
}
