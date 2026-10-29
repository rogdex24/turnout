import type { GroupResponse } from "@turnout/contract/app/groups";
import type { Plan } from "@turnout/contract/app/plans";
import { othersCount } from "./plan";

/**
 * All the plan page may know of a group: how big it is, whether it is smaller than usual, and when the names open and the group
 * meets. Everything else the group answer carries, the members and the cafe among it, is dropped here, so no screen built on this
 * can draw a person. The meet card is where they are shown.
 */
export interface GroupFacts {
  size: number;
  others: number;
  /** Null while the group answer is not in (offline, or not asked for yet). */
  belowPlan: boolean | null;
  revealAt: string;
  meetAt: string | null;
}

export function groupFacts(plan: Pick<Plan, "group">, group: GroupResponse | null | undefined): GroupFacts | null {
  if (plan.group === null) return null;
  // The plan is polled on its page and carries the size the server holds now; a group answer may be older.
  const size = plan.group.size;
  return {
    size,
    others: othersCount(size),
    belowPlan: group?.belowPlan ?? null,
    revealAt: group?.revealAt ?? plan.group.revealAt,
    meetAt: group?.meetAt ?? null,
  };
}
