import type { Plan, PlanState } from "@turnout/contract/app/plans";
import { assertNever } from "./plan";

/** The three steps of a plan: the ticket, the group, the meet card. */
export type StepState = "done" | "now" | "now_live" | "pending" | "off";
export type PlanSteps = readonly [ticket: StepState, group: StepState, meetCard: StepState];

/** Where a plan is on its three steps. A plan that ended without a group shows the steps that will not happen. A withdrawn one shows none. */
export function planSteps(plan: Pick<Plan, "state" | "ticket">): PlanSteps | null {
  const state: PlanState = plan.state;
  switch (state) {
    case "needs_ticket":
    case "checking_ticket":
    case "ticket_rejected":
      return ["now", "pending", "pending"];
    case "finding_group":
      return ["done", "now_live", "pending"];
    case "group_confirmed":
      return ["done", "done", "now"];
    case "meet_card_live":
      return ["done", "done", "now_live"];
    case "done":
      return ["done", "done", "done"];
    case "no_group":
      return [plan.ticket?.state === "approved" ? "done" : "off", "off", "off"];
    case "withdrawn":
      return null;
    default:
      return assertNever(state);
  }
}
