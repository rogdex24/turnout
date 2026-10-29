import { PLAN_STATES, type PlanReason, type PlanState, TERMINAL_PLAN_STATES, type WITHDRAWN_REASONS } from "@turnout/contract/app/plans";

/** Everything that can happen to a plan. The caller decides which one it is; this file only says where it leads. */
export type PlanEvent =
  | { type: "ticket_uploaded" }
  | { type: "ticket_approved" }
  | { type: "ticket_rejected" }
  | { type: "group_placed" }
  /** The group fell under the minimum before the lock: back to finding. */
  | { type: "group_dissolved" }
  | { type: "group_called_off" }
  /** T-3h. */
  | { type: "reveal" }
  /** 10:00 IST the morning after. */
  | { type: "morning_after" }
  /** T-24h arrived and the plan has no group. `handle` is the member's handle status then, null when there is no handle. */
  | { type: "lock_lapsed"; handle: "pending" | "approved" | "rejected" | null }
  | { type: "withdraw"; reason: (typeof WITHDRAWN_REASONS)[number] };

export interface PlanMove {
  state: PlanState;
  /** Set exactly when the plan ends as `no_group` or `withdrawn`. */
  reason: PlanReason | null;
}

export class InvalidPlanTransition extends Error {
  constructor(from: PlanState, event: string) {
    super(`a plan in ${from} cannot take ${event}`);
    this.name = "InvalidPlanTransition";
  }
}

const isTerminal = (state: PlanState) => (TERMINAL_PLAN_STATES as readonly PlanState[]).includes(state);

/** Why a plan with no group at T-24h ends. A plan past the ticket stage that never found a group names the handle when that was the block. */
export function lapseReason(state: PlanState, handle: "pending" | "approved" | "rejected" | null): PlanReason {
  switch (state) {
    case "needs_ticket":
      return "no_ticket";
    case "checking_ticket":
      return "late_review";
    case "ticket_rejected":
      return "ticket_rejected";
    case "finding_group":
      return handle === "pending" ? "handle_pending" : handle === "rejected" ? "handle_rejected" : "no_match";
    default:
      throw new InvalidPlanTransition(state, "lock_lapsed");
  }
}

/** The plan's state table. Any pair not listed throws, a terminal plan never moves. The database move is a compare-and-set on the old state. */
export function planTransition(from: PlanState, event: PlanEvent): PlanMove {
  if (!PLAN_STATES.includes(from) || isTerminal(from)) throw new InvalidPlanTransition(from, event.type);
  const move = (state: PlanState, reason: PlanReason | null = null): PlanMove => ({ state, reason });
  switch (event.type) {
    case "ticket_uploaded":
      if (from === "needs_ticket" || from === "ticket_rejected") return move("checking_ticket");
      break;
    case "ticket_approved":
      if (from === "checking_ticket") return move("finding_group");
      break;
    case "ticket_rejected":
      if (from === "checking_ticket") return move("ticket_rejected");
      break;
    case "group_placed":
      if (from === "finding_group") return move("group_confirmed");
      break;
    case "group_dissolved":
      if (from === "group_confirmed") return move("finding_group");
      break;
    case "group_called_off":
      if (from === "group_confirmed" || from === "meet_card_live") return move("no_group", "group_called_off");
      break;
    case "reveal":
      if (from === "group_confirmed") return move("meet_card_live");
      break;
    case "morning_after":
      if (from === "meet_card_live") return move("done");
      break;
    case "lock_lapsed":
      if (from !== "group_confirmed" && from !== "meet_card_live") return move("no_group", lapseReason(from, event.handle));
      break;
    case "withdraw":
      return move("withdrawn", event.reason);
  }
  throw new InvalidPlanTransition(from, event.type);
}
