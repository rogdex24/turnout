import type { Plan } from "@turnout/contract/app/plans";
import { meetPhase } from "./meetWindow";
import { isTerminal } from "./plan";

/**
 * True when leaving now tells a group that someone left: a plan still in play that has a group, in the last 3 hours before the show
 * (the reveal at T-3h) or after it started. Before then the group is not shown to anyone, so a withdrawal is quiet. The person is
 * never named to the group.
 */
export function groupWillBeTold(plans: readonly Plan[], now: number): boolean {
  return plans.some(
    (plan) =>
      plan.group !== null &&
      !isTerminal(plan.state) &&
      meetPhase({ revealAt: plan.group.revealAt, startsAt: plan.show.startsAt }, now) === "live",
  );
}
