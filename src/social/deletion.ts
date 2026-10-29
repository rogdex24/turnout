import type { Database } from "bun:sqlite";
import { type BanReason, writeBan } from "./bans.js";
import { withdrawPlan } from "./groups.js";
import { getMember } from "./members.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";

/**
 * Why an account is erased. A member's own deletion never touches the ban list. `request` is the same erasure done by the operator
 * for a member who asked in writing without the app: it leaves the ban list alone too, and differs from `self` only in the reason
 * kept on the tombstone. A ban writes one row of `phone_hash` and `reason` (no member id) so the number cannot sign up again.
 */
export type EraseKind =
  | { kind: "self" }
  | { kind: "request" }
  | { kind: "ban"; pepper: string; reason: Extract<BanReason, "report_upheld" | "operator"> };

export type EraseResult = { ok: true; fileKeys: string[] } | { ok: false; error: "not_found" };

const LIVE_PLANS = "('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group', 'group_confirmed', 'meet_card_live')";

/**
 * Erases a member in one transaction. Open plans leave through the loss rule first, so each group they were in is told someone left
 * (never who) or is dissolved. Then everything about the person goes: profile, handle, devices, sessions, notices and their
 * deliveries, memberships, their messages and presence, downvotes and met edges that involve them, plans and ticket rows. What stays
 * is the `member` row as a tombstone (no phone, status `deleted`), consent records, and reports, all under the same id: they are the
 * proof of what the person agreed to and of a complaint that was made, and are kept the year the data map says.
 *
 * Returns the file keys that were pointed at (the photo and every ticket file). The caller deletes them after the commit; the
 * nightly sweep removes anything the caller missed.
 */
export function eraseMember(db: Database, memberId: string, how: EraseKind, now: Date, t: Tunables = DEFAULT_TUNABLES): EraseResult {
  return db
    .transaction((): EraseResult => {
      const member = getMember(db, memberId);
      if (member === null || member.status === "deleted") return { ok: false, error: "not_found" };
      const at = now.toISOString();

      const plans = db.query(`SELECT id FROM plan WHERE member_id = ? AND state IN ${LIVE_PLANS}`).all(memberId) as { id: string }[];
      for (const plan of plans) withdrawPlan(db, plan.id, how.kind === "ban" ? "banned" : "deleted", now, t);

      const fileKeys: string[] = [];
      const photo = db.query("SELECT photo_key FROM profile WHERE member_id = ?").get(memberId) as { photo_key: string | null } | null;
      if (photo?.photo_key) fileKeys.push(photo.photo_key);
      const tickets = db
        .query("SELECT t.object_key FROM ticket_proof t JOIN plan p ON p.id = t.plan_id WHERE p.member_id = ? AND t.object_key IS NOT NULL")
        .all(memberId) as { object_key: string }[];
      for (const ticket of tickets) fileKeys.push(ticket.object_key);

      if (how.kind === "ban" && member.phone_e164 !== null) writeBan(db, how.pepper, member.phone_e164, how.reason, now);

      // Deliveries go with their notice and with their device (cascade); a plan takes its ticket rows and memberships.
      db.query("DELETE FROM device WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM notice WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM message WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM thread_presence WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM downvote WHERE voter_id = ? OR target_id = ?").run(memberId, memberId);
      db.query("DELETE FROM met_edge WHERE member_a = ? OR member_b = ?").run(memberId, memberId);
      db.query("DELETE FROM group_member WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM plan WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM social_handle WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM profile WHERE member_id = ?").run(memberId);
      db.query("DELETE FROM auth_session WHERE member_id = ?").run(memberId);

      db.query(
        "UPDATE member SET phone_e164 = NULL, stop_baseline_at = NULL, status = 'deleted', status_reason = ?, deleted_at = ?, updated_at = ? WHERE id = ?",
      ).run(how.kind, at, at, memberId);
      return { ok: true, fileKeys };
    })
    .immediate();
}
