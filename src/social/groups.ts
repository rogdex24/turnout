import type { Database } from "bun:sqlite";
import type { GroupType } from "@turnout/contract/app/plans";
import type { Gender } from "@turnout/contract/profile";
import { ulid } from "../utils/ulid.js";
import { getHandle } from "./handles.js";
import { matchableInput } from "./matching.js";
import { type Assignment, assign, neverPairSet } from "./model/grouping.js";
import { groupAfterLoss, lossNotice } from "./model/groupLoss.js";
import { isMatchable } from "./model/matchable.js";
import { canCheckIn, canReveal, meetAt, milestones } from "./model/schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { addNotice } from "./notices.js";
import { getPlan, movePlan, type PlanRow, planLockAt } from "./plans.js";
import { getProfile } from "./profiles.js";

export type GroupRowState = "confirmed" | "locked" | "live" | "done" | "called_off" | "dissolved";

export interface GroupRow {
  id: string;
  event_id: string;
  starts_at: string;
  group_type: GroupType;
  state: GroupRowState;
  cafe_name: string | null;
  cafe_address: string | null;
  cafe_lat: number | null;
  cafe_lng: number | null;
  meet_at: string | null;
  created_at: string;
  locked_at: string | null;
  live_at: string | null;
  ended_at: string | null;
  updated_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  member_id: string;
  plan_id: string;
  member_ref: string;
  joined_at: string;
  left_at: string | null;
  checked_in_at: string | null;
}

/** The group states a member can open. A dissolved or called-off group is a plan's reason and nothing else. */
const OPENABLE = ["confirmed", "locked", "live", "done"] as const;

export const getGroup = (db: Database, id: string): GroupRow | null =>
  db.query("SELECT * FROM show_group WHERE id = ?").get(id) as GroupRow | null;

/** Who is in the group now, in the order they joined. */
export function currentMembers(db: Database, groupId: string): GroupMemberRow[] {
  return db
    .query("SELECT * FROM group_member WHERE group_id = ? AND left_at IS NULL ORDER BY joined_at, id")
    .all(groupId) as GroupMemberRow[];
}

export const groupSize = (db: Database, groupId: string): number =>
  (db.query("SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND left_at IS NULL").get(groupId) as { n: number }).n;

/** Smaller than the usual minimum, and still going ahead. */
export const belowPlan = (size: number, t: Tunables = DEFAULT_TUNABLES): boolean => size < t.groupSize.min;

/**
 * The group, with the caller's own place in it, when the caller is in it and it is one they can open. Anything else is null:
 * a group that does not exist, one they were never in, one they left, one that was dissolved or called off.
 */
export function getGroupForMember(db: Database, groupId: string, memberId: string): { group: GroupRow; mine: GroupMemberRow } | null {
  const group = getGroup(db, groupId);
  if (group === null || !(OPENABLE as readonly string[]).includes(group.state)) return null;
  const mine = db
    .query("SELECT * FROM group_member WHERE group_id = ? AND member_id = ? AND left_at IS NULL")
    .get(groupId, memberId) as GroupMemberRow | null;
  return mine === null ? null : { group, mine };
}

export interface RevealedMember {
  memberRef: string;
  firstName: string;
  photoKey: string | null;
  checkedIn: boolean;
  isYou: boolean;
}

/** Everyone in the group, for a viewer who is in it and past T-3h. The route checks both before it calls this. */
export function revealedMembers(db: Database, groupId: string, viewerMemberId: string): RevealedMember[] {
  return currentMembers(db, groupId).map((m) => {
    const profile = getProfile(db, m.member_id);
    return {
      memberRef: m.member_ref,
      firstName: profile?.first_name ?? "",
      photoKey: profile?.photo_key ?? null,
      checkedIn: m.checked_in_at !== null,
      isYou: m.member_id === viewerMemberId,
    };
  });
}

/** The photo key for one member of the group, by the opaque ref. Null when the ref is not a current member of this group. */
export function memberPhotoKey(db: Database, groupId: string, memberRef: string): string | null {
  const row = db
    .query(
      `SELECT p.photo_key AS photoKey FROM group_member gm JOIN profile p ON p.member_id = gm.member_id
       WHERE gm.group_id = ? AND gm.member_ref = ? AND gm.left_at IS NULL`,
    )
    .get(groupId, memberRef) as { photoKey: string | null } | null;
  return row?.photoKey ?? null;
}

export type CheckInResult = { ok: true } | { ok: false; error: "not_found" | "outside_window" };

/** A member of a group that is live marks that they arrived. Idempotent: the first time is kept. Only between T-90m and T+60m. */
export function checkIn(db: Database, groupId: string, memberId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): CheckInResult {
  const found = getGroupForMember(db, groupId, memberId);
  if (found === null) return { ok: false, error: "not_found" };
  if (found.group.state !== "live" || !canCheckIn(found.group.starts_at, now, t)) return { ok: false, error: "outside_window" };
  db.query("UPDATE group_member SET checked_in_at = COALESCE(checked_in_at, ?) WHERE id = ?").run(now.toISOString(), found.mine.id);
  return { ok: true };
}

/** Pairs who must not share a group. The data comes with blocking and reports in M4; until then nobody is kept apart. */
function neverPairsAmong(_db: Database, _memberIds: readonly string[]): ReadonlySet<string> {
  return neverPairSet([]);
}

function addToGroup(db: Database, group: Pick<GroupRow, "id">, plan: PlanRow, now: Date, t: Tunables): void {
  const at = now.toISOString();
  db.query("INSERT INTO group_member (id, group_id, member_id, plan_id, member_ref, joined_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    ulid(now),
    group.id,
    plan.member_id,
    plan.id,
    crypto.randomUUID().replaceAll("-", "").slice(0, 16),
    at,
  );
  const moved = movePlan(db, plan, { type: "group_placed" }, now);
  if (moved === null) throw new Error("the plan moved while it was placed in a group");
  db.query("UPDATE plan SET group_id = ? WHERE id = ?").run(group.id, plan.id);
  addNotice(
    db,
    {
      memberId: plan.member_id,
      kind: "group_confirmed",
      planId: plan.id,
      groupId: group.id,
      dedupeKey: `group_confirmed:${plan.id}:${group.id}`,
      now,
    },
    t,
  );
}

export interface GroupingResult {
  created: number;
  joined: number;
}

/**
 * One grouping pass for one show, in one transaction: who is waiting is read, `assign` decides, and the groups, the members, the plan
 * moves and the notices are written together, so a crash leaves either all of it or none. Nothing happens from the lock on. Members
 * whose handle is not approved (or who are no longer matchable) stay out of the pool and keep waiting.
 */
export function runGroupingPass(db: Database, eventId: string, now: Date, t: Tunables = DEFAULT_TUNABLES): GroupingResult {
  return db
    .transaction((): GroupingResult => {
      const none = { created: 0, joined: 0 };
      const plans = db
        .query("SELECT * FROM plan WHERE event_id = ? AND state = 'finding_group' ORDER BY created_at, id")
        .all(eventId) as PlanRow[];
      const first = plans[0];
      if (first === undefined || now.getTime() >= Date.parse(planLockAt(first, t))) return none;

      const byMember = new Map<string, PlanRow>();
      const gender = new Map<string, Gender>();
      const pool: { memberId: string; gender: Gender; groupType: GroupType; approvedAt: string | null }[] = [];
      for (const plan of plans) {
        const input = matchableInput(db, plan.member_id);
        if (input === null || !isMatchable(input) || input.gender === null) continue;
        byMember.set(plan.member_id, plan);
        gender.set(plan.member_id, input.gender);
        pool.push({
          memberId: plan.member_id,
          gender: input.gender,
          groupType: plan.group_type,
          approvedAt: getHandle(db, plan.member_id)?.reviewed_at ?? null,
        });
      }
      if (pool.length === 0) return none;

      const groups = (
        db.query("SELECT * FROM show_group WHERE event_id = ? AND state = 'confirmed' ORDER BY id").all(eventId) as GroupRow[]
      ).map((g) => ({
        groupId: g.id,
        groupType: g.group_type,
        members: currentMembers(db, g.id).map((m) => ({
          memberId: m.member_id,
          gender: getProfile(db, m.member_id)?.gender ?? "non_binary",
        })),
      }));
      const everyone = [...pool.map((p) => p.memberId), ...groups.flatMap((g) => g.members.map((m) => m.memberId))];
      const result: Assignment = assign(pool, groups, neverPairsAmong(db, everyone), t);

      const at = now.toISOString();
      for (const join of result.joins) addToGroup(db, { id: join.groupId }, byMember.get(join.memberId) as PlanRow, now, t);
      for (const made of result.created) {
        const id = ulid(now);
        db.query(
          "INSERT INTO show_group (id, event_id, starts_at, group_type, state, meet_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?)",
        ).run(id, eventId, first.show_starts_at, made.groupType, meetAt(first.show_starts_at, t), at, at);
        for (const memberId of made.memberIds) addToGroup(db, { id }, byMember.get(memberId) as PlanRow, now, t);
      }
      return { created: result.created.length, joined: result.joins.length };
    })
    .immediate();
}

/** The shows that have someone waiting, for the ticker's grouping passes. */
export function showsWithWaiting(db: Database): string[] {
  return (
    db.query("SELECT DISTINCT event_id FROM plan WHERE state = 'finding_group' ORDER BY event_id").all() as { event_id: string }[]
  ).map((r) => r.event_id);
}

/** Plans leave a group that is going away: back to finding (dissolved) or out (called off). */
function releaseMembers(db: Database, group: GroupRow, now: Date): GroupMemberRow[] {
  const members = currentMembers(db, group.id);
  db.query("UPDATE group_member SET left_at = ? WHERE group_id = ? AND left_at IS NULL").run(now.toISOString(), group.id);
  return members;
}

function dissolveGroup(db: Database, group: GroupRow, now: Date, t: Tunables): void {
  const at = now.toISOString();
  for (const m of releaseMembers(db, group, now)) {
    const plan = getPlan(db, m.plan_id) as PlanRow;
    if (movePlan(db, plan, { type: "group_dissolved" }, now) === null) throw new Error("the plan moved while its group dissolved");
    db.query("UPDATE plan SET group_id = NULL WHERE id = ?").run(plan.id);
    addNotice(
      db,
      {
        memberId: m.member_id,
        kind: "group_changed",
        planId: plan.id,
        groupId: null,
        dedupeKey: `group_changed:${plan.id}:${group.id}`,
        now,
      },
      t,
    );
  }
  db.query("UPDATE show_group SET state = 'dissolved', ended_at = ?, updated_at = ? WHERE id = ?").run(at, at, group.id);
}

/** The group is over before the show: every member still in it ends as `no_group` with the reason `group_called_off`. */
export function callOffGroup(db: Database, group: GroupRow, now: Date, t: Tunables = DEFAULT_TUNABLES): void {
  const at = now.toISOString();
  for (const m of releaseMembers(db, group, now)) {
    const plan = getPlan(db, m.plan_id) as PlanRow;
    if (movePlan(db, plan, { type: "group_called_off" }, now) === null) throw new Error("the plan moved while its group was called off");
    db.query("UPDATE plan SET group_id = NULL WHERE id = ?").run(plan.id);
    addNotice(
      db,
      { memberId: m.member_id, kind: "group_called_off", planId: plan.id, groupId: null, dedupeKey: `group_called_off:${plan.id}`, now },
      t,
    );
  }
  db.query("UPDATE show_group SET state = 'called_off', ended_at = ?, updated_at = ? WHERE id = ?").run(at, at, group.id);
}

const isLocked = (group: GroupRow, now: Date, t: Tunables): boolean =>
  group.state !== "confirmed" || now.getTime() >= Date.parse(planLockAt({ show_starts_at: group.starts_at }, t));

/**
 * A member leaves their group. The group keeps going, shrinks, dissolves or is called off by `groupAfterLoss`. The members who
 * stay get a notice of the kind and nothing else: it never says who left or why. An unlocked group that stays is topped up by a pass.
 */
function loseMember(db: Database, group: GroupRow, leaving: GroupMemberRow, now: Date, t: Tunables): void {
  const before = groupSize(db, group.id);
  db.query("UPDATE group_member SET left_at = ? WHERE id = ? AND left_at IS NULL").run(now.toISOString(), leaving.id);
  const verdict = groupAfterLoss(before, before - 1, isLocked(group, now, t), t);
  if (verdict.outcome === "dissolve") dissolveGroup(db, group, now, t);
  else if (verdict.outcome === "called_off") callOffGroup(db, group, now, t);
  else {
    const kind = lossNotice(verdict.outcome);
    for (const m of currentMembers(db, group.id)) {
      addNotice(
        db,
        { memberId: m.member_id, kind, planId: m.plan_id, groupId: group.id, dedupeKey: `${kind}:${m.plan_id}:${leaving.plan_id}`, now },
        t,
      );
    }
  }
  if (verdict.outcome === "stay" || verdict.outcome === "dissolve") runGroupingPass(db, group.event_id, now, t);
}

export type WithdrawReason = "cancelled" | "suspended" | "banned" | "stopped" | "deleted" | "delisted";
export type WithdrawResult = { ok: true; plan: PlanRow } | { ok: false; error: "not_found" | "plan_closed" };

/** Ends a plan that is not over. A plan in a group takes the group through the loss rule in the same transaction. */
export function withdrawPlan(
  db: Database,
  planId: string,
  reason: WithdrawReason,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): WithdrawResult {
  return db
    .transaction((): WithdrawResult => {
      const plan = getPlan(db, planId);
      if (plan === null) return { ok: false, error: "not_found" };
      if (plan.state === "no_group" || plan.state === "withdrawn" || plan.state === "done") return { ok: false, error: "plan_closed" };
      const moved = movePlan(db, plan, { type: "withdraw", reason }, now);
      if (moved === null) return { ok: false, error: "plan_closed" };
      const leaving = db.query("SELECT * FROM group_member WHERE plan_id = ? AND left_at IS NULL").get(plan.id) as GroupMemberRow | null;
      db.query("UPDATE plan SET group_id = NULL WHERE id = ?").run(plan.id);
      if (leaving !== null) loseMember(db, getGroup(db, leaving.group_id) as GroupRow, leaving, now, t);
      return { ok: true, plan: getPlan(db, plan.id) as PlanRow };
    })
    .immediate();
}

/** T-24h: a confirmed group becomes locked. A group that somehow holds fewer than the minimum is dissolved instead, and its members lapse. */
export function lockGroups(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): number {
  let locked = 0;
  const groups = db.query("SELECT * FROM show_group WHERE state = 'confirmed' ORDER BY starts_at, id").all() as GroupRow[];
  for (const group of groups) {
    if (now.getTime() < Date.parse(planLockAt({ show_starts_at: group.starts_at }, t))) continue;
    db.transaction(() => {
      const at = now.toISOString();
      if (groupSize(db, group.id) < t.groupSize.min) {
        dissolveGroup(db, group, now, t);
        return;
      }
      db.query("UPDATE show_group SET state = 'locked', locked_at = ?, updated_at = ? WHERE id = ? AND state = 'confirmed'").run(
        at,
        at,
        group.id,
      );
      locked += 1;
    }).immediate();
  }
  return locked;
}

/** T-3h: a group goes live, its members' plans show the meet card, and each member is told. Returns how many groups went live. */
export function revealGroups(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): number {
  let live = 0;
  const groups = db.query("SELECT * FROM show_group WHERE state IN ('confirmed', 'locked') ORDER BY starts_at, id").all() as GroupRow[];
  for (const group of groups) {
    if (group.state !== "locked" || !canReveal({ startsAt: group.starts_at, state: group.state }, now, t)) continue;
    db.transaction(() => {
      const at = now.toISOString();
      const changed = db
        .query("UPDATE show_group SET state = 'live', live_at = ?, updated_at = ? WHERE id = ? AND state = 'locked'")
        .run(at, at, group.id).changes;
      if (changed !== 1) return;
      for (const m of currentMembers(db, group.id)) {
        const plan = getPlan(db, m.plan_id) as PlanRow;
        if (movePlan(db, plan, { type: "reveal" }, now) === null) throw new Error("the plan moved while its group was revealed");
        addNotice(
          db,
          {
            memberId: m.member_id,
            kind: "meet_card_live",
            planId: plan.id,
            groupId: group.id,
            dedupeKey: `meet_card_live:${plan.id}`,
            now,
          },
          t,
        );
      }
      live += 1;
    }).immediate();
  }
  return live;
}

/** From T-90m until the show starts: members of a live group are told to head over, once. */
export function headOverNotices(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): number {
  let sent = 0;
  const plans = db.query("SELECT * FROM plan WHERE state = 'meet_card_live' ORDER BY show_starts_at, id").all() as PlanRow[];
  for (const plan of plans) {
    const m = milestones(plan.show_starts_at, t);
    if (now.getTime() < Date.parse(m.headOverAt) || now.getTime() >= Date.parse(plan.show_starts_at)) continue;
    if (
      addNotice(
        db,
        { memberId: plan.member_id, kind: "head_over", planId: plan.id, groupId: plan.group_id, dedupeKey: `head_over:${plan.id}`, now },
        t,
      ) !== null
    )
      sent += 1;
  }
  return sent;
}

/** 10:00 IST the morning after: plans and their groups are done, and each member gets the morning-after notice. */
export function finishShows(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): number {
  let finished = 0;
  const plans = db.query("SELECT * FROM plan WHERE state = 'meet_card_live' ORDER BY show_starts_at, id").all() as PlanRow[];
  for (const plan of plans) {
    if (now.getTime() < Date.parse(milestones(plan.show_starts_at, t).morningAfterAt)) continue;
    db.transaction(() => {
      if (movePlan(db, plan, { type: "morning_after" }, now) === null) return;
      addNotice(
        db,
        {
          memberId: plan.member_id,
          kind: "morning_after",
          planId: plan.id,
          groupId: plan.group_id,
          dedupeKey: `morning_after:${plan.id}`,
          now,
        },
        t,
      );
      finished += 1;
    }).immediate();
  }
  const at = now.toISOString();
  for (const group of db.query("SELECT * FROM show_group WHERE state = 'live'").all() as GroupRow[]) {
    if (now.getTime() >= Date.parse(milestones(group.starts_at, t).morningAfterAt)) {
      db.query("UPDATE show_group SET state = 'done', ended_at = ?, updated_at = ? WHERE id = ? AND state = 'live'").run(at, at, group.id);
    }
  }
  return finished;
}
