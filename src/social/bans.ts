import type { Database } from "bun:sqlite";
import { createHmac } from "node:crypto";
import type { BAN_REASONS } from "./schema.js";

export type BanReason = (typeof BAN_REASONS)[number];

/** The two reasons that turn a number away at sign-in. A stop keeps the account and only marks a new one on the same number. */
const REFUSING: readonly BanReason[] = ["report_upheld", "operator"];

/** `HMAC-SHA256(BAN_PEPPER, E.164)`. The pepper is never rotated: a new one would lose every ban. */
export function banHash(pepper: string, e164: string): string {
  return createHmac("sha256", pepper).update(e164).digest("hex");
}

const CHECK_TEXT = "turnout-ban-pepper-check";

/** `HMAC-SHA256(BAN_PEPPER, "turnout-ban-pepper-check")`: shows two processes hold one pepper without storing it. */
function pepperFingerprint(pepper: string): string {
  return createHmac("sha256", pepper).update(CHECK_TEXT).digest("hex");
}

/** The app calls this at start. It overwrites, so the row always describes the pepper the app is running with. */
export function recordPepper(db: Database, pepper: string, now: Date): void {
  db.query(
    "INSERT INTO ban_pepper_check (id, fingerprint, written_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET fingerprint = excluded.fingerprint, written_at = excluded.written_at",
  ).run(pepperFingerprint(pepper), now.toISOString());
}

/** `unknown` when the app has never started on this database, so there is nothing to compare with. */
export function pepperCheck(db: Database, pepper: string): "match" | "mismatch" | "unknown" {
  const row = db.query("SELECT fingerprint FROM ban_pepper_check WHERE id = 1").get() as { fingerprint: string } | null;
  if (row === null) return "unknown";
  return row.fingerprint === pepperFingerprint(pepper) ? "match" : "mismatch";
}

/** Why this number is on the list, or null. */
export function banReason(db: Database, pepper: string, e164: string): BanReason | null {
  const row = db.query("SELECT reason FROM ban_list WHERE phone_hash = ?").get(banHash(pepper, e164)) as { reason: BanReason } | null;
  return row === null ? null : row.reason;
}

/**
 * True when sign-in must be refused for this number: it is on the list for `report_upheld` or `operator`, or a member with it is
 * banned. A `downvote_stop` row does not refuse anyone; the person signs in and is told grouping has stopped.
 */
export function isPhoneRefused(db: Database, pepper: string, e164: string): boolean {
  const reason = banReason(db, pepper, e164);
  if (reason !== null && REFUSING.includes(reason)) return true;
  return db.query("SELECT 1 FROM member WHERE phone_e164 = ? AND status = 'banned'").get(e164) !== null;
}

/**
 * Writes one row for the number. A number already listed for a stop moves to the stronger reason; any other repeat changes nothing.
 * Returns true when the table changed.
 */
export function writeBan(db: Database, pepper: string, e164: string, reason: BanReason, now: Date): boolean {
  const hash = banHash(pepper, e164);
  const inserted = db
    .query("INSERT OR IGNORE INTO ban_list (phone_hash, reason, created_at) VALUES (?, ?, ?)")
    .run(hash, reason, now.toISOString());
  if (inserted.changes > 0) return true;
  if (reason === "downvote_stop") return false;
  return db.query("UPDATE ban_list SET reason = ? WHERE phone_hash = ? AND reason = 'downvote_stop'").run(reason, hash).changes > 0;
}

/** Removes the number from the list. The number is hashed here, so the operator never handles the hash. */
export function removeBan(db: Database, pepper: string, e164: string): boolean {
  return db.query("DELETE FROM ban_list WHERE phone_hash = ?").run(banHash(pepper, e164)).changes > 0;
}
