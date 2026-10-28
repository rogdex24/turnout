import type { Plan, PlanState } from "@turnout/contract/app/plans";
import { assertNever, othersCount } from "./plan";

/** The one line that says where a plan stands, on the Plans tab and the Home bar. Not the same as the state: a plan that ended has more than one way to read. */
export type PlanStatusKey =
  | "needs_ticket"
  | "checking_ticket"
  | "ticket_rejected"
  | "finding_group"
  | "group_confirmed"
  | "meet_card_live"
  | "called_off"
  | "closed"
  | "withdrawn"
  | "done";

/** How the line reads: signal for a live search, ink for something to do, muted for waiting or over. */
export type PlanTone = "live" | "action" | "ok" | "quiet";

export interface PlanStatus {
  key: PlanStatusKey;
  tone: PlanTone;
  /** For `done`: how many others the person went with. Zero when alone. */
  others: number;
}

/** These end a plan because no ticket was accepted in time; the rest are about the group. */
const NO_TICKET_REASONS = ["no_ticket", "late_review", "ticket_rejected"] as const;

function keyOf(plan: Pick<Plan, "state" | "reason">): PlanStatusKey {
  const state: PlanState = plan.state;
  switch (state) {
    case "needs_ticket":
    case "checking_ticket":
    case "ticket_rejected":
    case "finding_group":
    case "group_confirmed":
    case "meet_card_live":
    case "withdrawn":
    case "done":
      return state;
    case "no_group":
      return plan.reason !== null && (NO_TICKET_REASONS as readonly string[]).includes(plan.reason) ? "closed" : "called_off";
    default:
      return assertNever(state);
  }
}

const TONES: Record<PlanStatusKey, PlanTone> = {
  needs_ticket: "action",
  checking_ticket: "quiet",
  ticket_rejected: "action",
  finding_group: "live",
  group_confirmed: "ok",
  meet_card_live: "live",
  called_off: "quiet",
  closed: "quiet",
  withdrawn: "quiet",
  done: "ok",
};

export function planStatus(plan: Pick<Plan, "state" | "reason" | "group">): PlanStatus {
  const key = keyOf(plan);
  return { key, tone: TONES[key], others: plan.group ? othersCount(plan.group.size) : 0 };
}
