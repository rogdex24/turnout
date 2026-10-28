import type { Database } from "bun:sqlite";
import { addMinutes } from "./dates.js";
import {
  callOffGroup,
  finishShows,
  type GroupRow,
  headOverNotices,
  lockGroups,
  revealGroups,
  runGroupingPass,
  showsWithWaiting,
  type WithdrawReason,
  withdrawPlan,
} from "./groups.js";
import { getHandle } from "./handles.js";
import { milestones } from "./model/schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { addNotice } from "./notices.js";
import { movePlan, type PlanRow, planLockAt } from "./plans.js";

/** An alert for the operator. `key` is unique to the thing that needs a person, so each fires once whatever the tick count. */
export interface TickAlert {
  key: string;
  text: string;
}

export interface TickResult {
  withdrawn: number;
  locked: number;
  lapsed: number;
  grouped: number;
  revealed: number;
  headOver: number;
  finished: number;
  alerts: TickAlert[];
}

const LIVE_PLAN_STATES = "('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group', 'group_confirmed', 'meet_card_live')";

/** Members who are no longer active, and shows that were delisted, take their plans with them. */
function withdrawGone(db: Database, now: Date, t: Tunables): number {
  let withdrawn = 0;
  const delisted = db
    .query(
      `SELECT DISTINCT p.event_id AS id FROM plan p JOIN event e ON e.id = p.event_id WHERE e.status = 'delisted' AND p.state IN ${LIVE_PLAN_STATES}`,
    )
    .all() as { id: string }[];
  for (const { id } of delisted) {
    const groups = db
      .query("SELECT * FROM show_group WHERE event_id = ? AND state IN ('confirmed', 'locked', 'live')")
      .all(id) as GroupRow[];
    for (const group of groups) db.transaction(() => callOffGroup(db, group, now, t)).immediate();
    const plans = db.query(`SELECT id FROM plan WHERE event_id = ? AND state IN ${LIVE_PLAN_STATES}`).all(id) as { id: string }[];
    for (const plan of plans) if (withdrawPlan(db, plan.id, "delisted", now, t).ok) withdrawn += 1;
  }
  const people = db
    .query(
      `SELECT p.id AS planId, m.status AS status FROM plan p JOIN member m ON m.id = p.member_id WHERE m.status != 'active' AND p.state IN ${LIVE_PLAN_STATES}`,
    )
    .all() as { planId: string; status: WithdrawReason }[];
  for (const person of people) if (withdrawPlan(db, person.planId, person.status, now, t).ok) withdrawn += 1;
  return withdrawn;
}

/** T-24h: a plan that has no group by now ends as `no_group`, with the reason that fits where it stopped, and its member is told. */
function lapsePlans(db: Database, now: Date, t: Tunables): number {
  let lapsed = 0;
  const plans = db
    .query(
      "SELECT * FROM plan WHERE state IN ('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group') ORDER BY show_starts_at, id",
    )
    .all() as PlanRow[];
  for (const plan of plans) {
    if (now.getTime() < Date.parse(planLockAt(plan, t))) continue;
    db.transaction(() => {
      const handle = getHandle(db, plan.member_id)?.status ?? null;
      if (movePlan(db, plan, { type: "lock_lapsed", handle }, now) === null) return;
      addNotice(
        db,
        { memberId: plan.member_id, kind: "no_group", planId: plan.id, groupId: null, dedupeKey: `no_group:${plan.id}`, now },
        t,
      );
      lapsed += 1;
    }).immediate();
  }
  return lapsed;
}

/** Records that an alert went out. False when it already had, so a later tick stays quiet. */
function claimAlert(db: Database, key: string, now: Date): boolean {
  return db.query("INSERT OR IGNORE INTO alert_sent (alert_key, sent_at) VALUES (?, ?)").run(key, now.toISOString()).changes === 1;
}

/**
 * What needs a person: a group without a cafe (once at the lock, once at T-6h) and a handle still pending when the show it
 * is for is within 12 hours of its lock. The text names a count of things, never a person.
 */
function operatorAlerts(db: Database, now: Date, t: Tunables): TickAlert[] {
  const alerts: TickAlert[] = [];
  const groups = db
    .query("SELECT * FROM show_group WHERE state IN ('confirmed', 'locked', 'live') AND cafe_name IS NULL ORDER BY starts_at, id")
    .all() as GroupRow[];
  for (const group of groups) {
    const m = milestones(group.starts_at, t);
    const title =
      (db.query("SELECT title FROM event WHERE id = ?").get(group.event_id) as { title: string } | null)?.title ?? group.event_id;
    if (now.getTime() >= Date.parse(m.lockAt) && claimAlert(db, `cafe_lock:${group.id}`, now)) {
      alerts.push({
        key: `cafe_lock:${group.id}`,
        text: `A group for ${title} (${group.starts_at}) has locked and has no cafe yet. Group ${group.id}.`,
      });
    }
    if (now.getTime() >= Date.parse(m.cafeAlertAt) && claimAlert(db, `cafe_late:${group.id}`, now)) {
      alerts.push({
        key: `cafe_late:${group.id}`,
        text: `A group for ${title} (${group.starts_at}) still has no cafe and the show is under ${t.plan.cafeAlertHoursBefore} hours away. Group ${group.id}.`,
      });
    }
  }
  const handles = db
    .query(
      `SELECT DISTINCT h.member_id AS memberId, h.submitted_at AS submittedAt, MIN(p.show_starts_at) AS startsAt
       FROM social_handle h JOIN plan p ON p.member_id = h.member_id
       WHERE h.status = 'pending' AND p.state IN ('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group')
       GROUP BY h.member_id`,
    )
    .all() as { memberId: string; submittedAt: string; startsAt: string }[];
  for (const h of handles) {
    const lockAt = Date.parse(planLockAt({ show_starts_at: h.startsAt }, t));
    if (now.getTime() < lockAt - t.plan.handleAlertHours * 60 * 60 * 1000 || now.getTime() >= lockAt) continue;
    const key = `handle_due:${h.memberId}:${h.submittedAt}`;
    if (claimAlert(db, key, now))
      alerts.push({
        key,
        text: `A handle is still pending and its show locks within ${t.plan.handleAlertHours} hours (${new Date(lockAt).toISOString()}). Member ${h.memberId}.`,
      });
  }
  return alerts;
}

/**
 * One pass over every clock-driven change, in an order that reads the earlier steps' results: gone members and shows, the lock,
 * lapsed plans, grouping, the reveal, head-over, the morning after. Every step writes its notices in its own transaction and is
 * safe to run again at the same instant: a second tick finds nothing left to do and adds no second notice.
 */
export function tick(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): TickResult {
  const withdrawn = withdrawGone(db, now, t);
  const locked = lockGroups(db, now, t);
  const lapsed = lapsePlans(db, now, t);
  let grouped = 0;
  for (const eventId of showsWithWaiting(db)) {
    const r = runGroupingPass(db, eventId, now, t);
    grouped += r.created + r.joined;
  }
  const revealed = revealGroups(db, now, t);
  const headOver = headOverNotices(db, now, t);
  const finished = finishShows(db, now, t);
  return { withdrawn, locked, lapsed, grouped, revealed, headOver, finished, alerts: operatorAlerts(db, now, t) };
}

export const TICK_LEASE = "ticker";

export interface LeaseStatus {
  holder: string;
  expiresAt: string;
  lastTickAt: string | null;
}

/** Takes the ticker lease, or renews it for the same holder. False when another process holds it and it has not run out. */
export function acquireLease(db: Database, name: string, holder: string, now: Date, leaseSeconds: number): boolean {
  const changed = db
    .query(
      `INSERT INTO scheduler_lease (name, holder, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
       WHERE scheduler_lease.holder = excluded.holder OR scheduler_lease.expires_at <= ?`,
    )
    .run(name, holder, addMinutes(now, leaseSeconds / 60).toISOString(), now.toISOString()).changes;
  return changed === 1;
}

/** Notes that a pass finished, and gives the lease up so the next process to look can take it at once. */
export function finishLease(db: Database, name: string, holder: string, now: Date): void {
  db.query("UPDATE scheduler_lease SET last_tick_at = ?, expires_at = ? WHERE name = ? AND holder = ?").run(
    now.toISOString(),
    now.toISOString(),
    name,
    holder,
  );
}

export function leaseStatus(db: Database, name: string = TICK_LEASE): LeaseStatus | null {
  const row = db
    .query("SELECT holder, expires_at AS expiresAt, last_tick_at AS lastTickAt FROM scheduler_lease WHERE name = ?")
    .get(name) as LeaseStatus | null;
  return row;
}
