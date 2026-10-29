import type { Database } from "bun:sqlite";
import { ulid } from "../utils/ulid.js";
import { writeBan } from "./bans.js";
import { getGroupForMember, withdrawPlan } from "./groups.js";
import { feedbackWindow, metPairs, stopRuleReached } from "./model/feedback.js";
import { milestones } from "./model/schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";

/** The `operator_action` an operator's reinstatement writes. The point the stop rule counts from is `member.stop_baseline_at`, set in the same step. */
export const REINSTATE_ACTION = "member_reinstate";

export type DownvoteResult = { ok: true; created: boolean } | { ok: false; error: "not_found" | "outside_window" };

/**
 * "I didn't feel comfortable." From a current member of a done group, about someone with a ref in it who is not themselves, in the
 * 72 hours after the morning after. A repeat is a success that changes nothing. Nobody is told: it is private.
 */
export function downvote(
  db: Database,
  groupId: string,
  voterId: string,
  memberRef: string,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): DownvoteResult {
  return db
    .transaction((): DownvoteResult => {
      const found = getGroupForMember(db, groupId, voterId);
      if (found === null) return { ok: false, error: "not_found" };
      const target = db.query("SELECT member_id FROM group_member WHERE group_id = ? AND member_ref = ?").get(groupId, memberRef) as {
        member_id: string;
      } | null;
      if (target === null || target.member_id === voterId) return { ok: false, error: "not_found" };
      if (feedbackWindow({ startsAt: found.group.starts_at, state: found.group.state }, now, t) !== "open") {
        return { ok: false, error: "outside_window" };
      }
      const inserted = db
        .query("INSERT OR IGNORE INTO downvote (id, group_id, voter_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(ulid(now), groupId, voterId, target.member_id, now.toISOString());
      return { ok: true, created: inserted.changes > 0 };
    })
    .immediate();
}

/** The refs in this group the member has downvoted, so the app can show them as done. */
export function downvotedRefs(db: Database, groupId: string, voterId: string): string[] {
  return (
    db
      .query(
        `SELECT gm.member_ref AS ref FROM downvote d JOIN group_member gm ON gm.group_id = d.group_id AND gm.member_id = d.target_id
         WHERE d.group_id = ? AND d.voter_id = ? ORDER BY d.created_at, d.id`,
      )
      .all(groupId, voterId) as { ref: string }[]
  ).map((r) => r.ref);
}

export interface BlockedPerson {
  firstName: string;
  showTitle: string;
  date: string;
}

/**
 * The people this member downvoted or reported, as the first name, the show and the show's date. Someone whose account was deleted
 * has no name left and is not listed. The list is read-only: there is nothing here to undo.
 */
export function blockedPeople(db: Database, memberId: string): BlockedPerson[] {
  return db
    .query(
      `SELECT pr.first_name AS firstName, pl.show_title AS showTitle, g.starts_at AS date
       FROM (SELECT group_id, target_id AS other FROM downvote WHERE voter_id = ?
             UNION SELECT group_id, subject_id AS other FROM report WHERE reporter_id = ?) x
       JOIN show_group g ON g.id = x.group_id
       JOIN profile pr ON pr.member_id = x.other
       JOIN group_member gm ON gm.group_id = x.group_id AND gm.member_id = ?
       JOIN plan pl ON pl.id = gm.plan_id
       WHERE pr.first_name IS NOT NULL
       ORDER BY g.starts_at DESC, pr.first_name`,
    )
    .all(memberId, memberId, memberId) as BlockedPerson[];
}

const OPEN_PLANS = "('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group', 'group_confirmed', 'meet_card_live')";

/**
 * The stop rule for one person: votes from enough different people at enough different shows, counting from their last reinstatement.
 * An active member who reaches it becomes `stopped`: their open plans are withdrawn, new ones are blocked (a stopped member is not
 * matchable) and the number goes on the ban list as `downvote_stop`, which turns nobody away. A suspended member who reaches it
 * stays suspended (their plans are already withdrawn) and only the number is listed, so that reinstating them or dismissing the
 * report gives `stopped` and not `active`. Returns true when the number was newly listed.
 */
function applyStopRule(db: Database, pepper: string, targetId: string, now: Date, t: Tunables): boolean {
  const member = db.query("SELECT status, phone_e164, stop_baseline_at FROM member WHERE id = ?").get(targetId) as {
    status: string;
    phone_e164: string | null;
    stop_baseline_at: string | null;
  } | null;
  if (member === null || (member.status !== "active" && member.status !== "suspended") || member.phone_e164 === null) return false;
  const since = member.stop_baseline_at ?? "";
  const votes = db
    .query(
      "SELECT d.voter_id AS voterId, g.event_id AS showId FROM downvote d JOIN show_group g ON g.id = d.group_id WHERE d.target_id = ? AND d.created_at > ?",
    )
    .all(targetId, since) as { voterId: string; showId: string }[];
  if (!stopRuleReached(votes, t)) return false;
  const at = now.toISOString();
  if (member.status === "suspended") return writeBan(db, pepper, member.phone_e164, "downvote_stop", now);
  db.query("UPDATE member SET status = 'stopped', status_reason = 'downvote_stop', updated_at = ? WHERE id = ?").run(at, targetId);
  writeBan(db, pepper, member.phone_e164, "downvote_stop", now);
  const plans = db.query(`SELECT id FROM plan WHERE member_id = ? AND state IN ${OPEN_PLANS}`).all(targetId) as { id: string }[];
  for (const plan of plans) withdrawPlan(db, plan.id, "stopped", now, t);
  return true;
}

export interface FeedbackCloseResult {
  closed: number;
  edges: number;
  stopped: number;
}

/**
 * Closes the feedback window of every done group whose 72 hours are up, once each (a `feedback_close` row marks it, so a second pass
 * finds nothing). Per group, in one transaction: met edges for pairs who both checked in when nobody was downvoted or reported, then
 * the stop rule for each person who was downvoted there.
 */
export function closeFeedback(db: Database, pepper: string, now: Date, t: Tunables = DEFAULT_TUNABLES): FeedbackCloseResult {
  const result: FeedbackCloseResult = { closed: 0, edges: 0, stopped: 0 };
  const groups = db
    .query(
      "SELECT id, starts_at FROM show_group WHERE state = 'done' AND id NOT IN (SELECT group_id FROM feedback_close) ORDER BY starts_at, id",
    )
    .all() as { id: string; starts_at: string }[];
  for (const group of groups) {
    if (now.getTime() < Date.parse(milestones(group.starts_at, t).feedbackClosesAt)) continue;
    db.transaction(() => {
      const at = now.toISOString();
      const marked = db.query("INSERT OR IGNORE INTO feedback_close (group_id, closed_at) VALUES (?, ?)").run(group.id, at).changes;
      if (marked === 0) return;
      result.closed += 1;
      const downvotes = db.query("SELECT DISTINCT target_id AS id FROM downvote WHERE group_id = ?").all(group.id) as { id: string }[];
      const reported = db.query("SELECT 1 FROM report WHERE group_id = ? LIMIT 1").get(group.id) !== null;
      const members = (
        db.query("SELECT member_id AS memberId, checked_in_at AS checkedInAt FROM group_member WHERE group_id = ?").all(group.id) as {
          memberId: string;
          checkedInAt: string | null;
        }[]
      ).map((m) => ({ memberId: m.memberId, checkedIn: m.checkedInAt !== null }));
      for (const [a, b] of metPairs(members, downvotes.length > 0 || reported)) {
        result.edges += db
          .query("INSERT OR IGNORE INTO met_edge (group_id, member_a, member_b, created_at) VALUES (?, ?, ?, ?)")
          .run(group.id, a, b, at).changes;
      }
      for (const target of downvotes) if (applyStopRule(db, pepper, target.id, now, t)) result.stopped += 1;
    }).immediate();
  }
  return result;
}
