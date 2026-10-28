import type { Database } from "bun:sqlite";
import type { GroupType, PlanReason, PlanState } from "@turnout/contract/app/plans";
import { canChooseWomenOnly } from "@turnout/contract/profile";
import { ulid } from "../utils/ulid.js";
import { missingForPlan } from "./matching.js";
import { joinUntil } from "./model/eligibility.js";
import type { MissingItem } from "./model/matchable.js";
import { type PlanEvent, planTransition } from "./model/planState.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { getProfile } from "./profiles.js";
import { getEligibleShow } from "./shows.js";

export interface PlanRow {
  id: string;
  member_id: string;
  event_id: string;
  dedupe_key: string;
  group_type: GroupType;
  state: PlanState;
  reason: PlanReason | null;
  show_title: string;
  show_starts_at: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export function getPlan(db: Database, id: string): PlanRow | null {
  return db.query("SELECT * FROM plan WHERE id = ?").get(id) as PlanRow | null;
}

/** The member's own plan. Someone else's plan gives the same null as a missing one. */
export function getPlanForMember(db: Database, planId: string, memberId: string): PlanRow | null {
  return db.query("SELECT * FROM plan WHERE id = ? AND member_id = ?").get(planId, memberId) as PlanRow | null;
}

/** The member's plans, newest first. */
export function listPlans(db: Database, memberId: string): PlanRow[] {
  return db.query("SELECT * FROM plan WHERE member_id = ? ORDER BY created_at DESC, id DESC").all(memberId) as PlanRow[];
}

/** The member's plan for this show's dedupe group that is not over, if there is one. */
export function livePlanFor(db: Database, memberId: string, dedupeKey: string): PlanRow | null {
  return db
    .query("SELECT * FROM plan WHERE member_id = ? AND dedupe_key = ? AND state NOT IN ('no_group', 'withdrawn', 'done')")
    .get(memberId, dedupeKey) as PlanRow | null;
}

/** The last moment a ticket can be sent and the moment the group locks. */
export const planLockAt = (plan: Pick<PlanRow, "show_starts_at">, t: Tunables = DEFAULT_TUNABLES): string =>
  joinUntil(plan.show_starts_at, t);

export type CreatePlanResult =
  | { ok: true; plan: PlanRow }
  | { ok: false; error: "show_not_found" }
  | { ok: false; error: "not_matchable"; missing: MissingItem[] }
  | { ok: false; error: "women_only" }
  | { ok: false; error: "plan_exists"; planId: string };

/**
 * Makes a plan in `needs_ticket`, with the show's title, start and venue copied in so a later change at the source cannot move it.
 * Checks, in order: the show can have a group now, the member has what a plan needs, `women_only` is for women and non-binary people,
 * and there is no live plan for the same show already (the answer names it, so a retry can carry on with it).
 */
export function createPlan(
  db: Database,
  input: { memberId: string; eventId: string; groupType: GroupType; now: Date },
  t: Tunables = DEFAULT_TUNABLES,
): CreatePlanResult {
  return db.transaction((): CreatePlanResult => {
    const show = getEligibleShow(db, input.eventId, input.now, t);
    if (show === null) return { ok: false, error: "show_not_found" };
    const missing = missingForPlan(db, input.memberId);
    if (missing.length > 0) return { ok: false, error: "not_matchable", missing };
    const gender = getProfile(db, input.memberId)?.gender ?? null;
    if (input.groupType === "women_only" && (gender === null || !canChooseWomenOnly(gender))) return { ok: false, error: "women_only" };
    const existing = livePlanFor(db, input.memberId, show.dedupeKey);
    if (existing !== null) return { ok: false, error: "plan_exists", planId: existing.id };
    const id = ulid(input.now);
    const at = input.now.toISOString();
    db.query(
      `INSERT INTO plan (id, member_id, event_id, dedupe_key, group_type, state, show_title, show_starts_at, venue_name, venue_lat, venue_lng,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'needs_ticket', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.memberId,
      show.id,
      show.dedupeKey,
      input.groupType,
      show.title,
      show.startsAt,
      show.venueName,
      show.venueLat,
      show.venueLng,
      at,
      at,
    );
    return { ok: true, plan: getPlan(db, id) as PlanRow };
  })();
}

/**
 * Moves a plan along its state table. The database change is `UPDATE ... WHERE id = ? AND state = <old>` and must touch one row:
 * when another request moved the plan first this returns null and changes nothing. A move the table does not allow throws.
 * Run it inside the transaction that also writes the notice and anything else the move implies.
 */
export function movePlan(db: Database, plan: Pick<PlanRow, "id" | "state">, event: PlanEvent, now: Date): PlanRow | null {
  const move = planTransition(plan.state, event);
  const changed = db
    .query("UPDATE plan SET state = ?, reason = ?, updated_at = ? WHERE id = ? AND state = ?")
    .run(move.state, move.reason, now.toISOString(), plan.id, plan.state).changes;
  return changed === 1 ? getPlan(db, plan.id) : null;
}
