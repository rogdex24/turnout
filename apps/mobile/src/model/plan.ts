import type { Plan, PlanState } from "@turnout/contract/app/plans";
import { TERMINAL_PLAN_STATES } from "@turnout/contract/app/plans";

/** The compiler's proof that a `switch` over a union handled every case. A new plan state fails the build here, not on a phone. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

export function isTerminal(state: PlanState): boolean {
  return (TERMINAL_PLAN_STATES as readonly string[]).includes(state);
}

/**
 * The states where the person has something to do: add a ticket, send another one, or go to the meet card. The Plans tab shows a
 * badge for each such plan. A plan that is only waiting (checking, finding a group, confirmed) or has ended asks for nothing.
 */
const NEEDS_PERSON: Record<PlanState, boolean> = {
  needs_ticket: true,
  checking_ticket: false,
  ticket_rejected: true,
  finding_group: false,
  group_confirmed: false,
  meet_card_live: true,
  no_group: false,
  withdrawn: false,
  done: false,
};

export function needsPerson(plan: Pick<Plan, "state">): boolean {
  return NEEDS_PERSON[plan.state];
}

/** How many plans need the person, for the Plans tab badge. */
export function badgeCount(plans: readonly Pick<Plan, "state">[]): number {
  return plans.filter(needsPerson).length;
}

export interface PlanGroups {
  /** Plans that can still move, the nearest show first. */
  upcoming: Plan[];
  /** Plans that ended, the latest show first. */
  past: Plan[];
}

const startsAt = (plan: Plan): number => Date.parse(plan.show.startsAt) || 0;

/** The Plans tab: upcoming and past, each in the order a person looks for them. */
export function groupPlans(plans: readonly Plan[]): PlanGroups {
  const upcoming = plans.filter((p) => !isTerminal(p.state)).sort((a, b) => startsAt(a) - startsAt(b));
  const past = plans.filter((p) => isTerminal(p.state)).sort((a, b) => startsAt(b) - startsAt(a));
  return { upcoming, past };
}

/** The plan the Home bar shows: the one a person most likely wants next. A plan that needs them comes first, then the nearest show. */
export function activePlan(plans: readonly Plan[]): Plan | null {
  const { upcoming } = groupPlans(plans);
  return upcoming.find(needsPerson) ?? upcoming[0] ?? null;
}

/** "Going with N people": the group's size counts the person, so the others are one fewer. Never below zero. */
export function othersCount(size: number): number {
  return Math.max(0, size - 1);
}
