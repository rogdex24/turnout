import type { NoticeKind } from "@turnout/contract/app/notices";
import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

export type LossOutcome = "stay" | "dissolve" | "go_ahead" | "called_off";

export interface LossVerdict {
  outcome: LossOutcome;
  /** The grouping pass may add people to the group again. Only an unlocked group that stays can refill. */
  refill: boolean;
}

/**
 * What a group does when members leave. `before` and `after` are the sizes either side of the loss; `locked` is
 * true from T-24h. Before the lock, the minimum (4) stays and refills, fewer dissolve and their members go back to
 * finding. After it, the lock minimum (3) goes ahead with who is left and fewer are called off.
 */
export function groupAfterLoss(
  before: number,
  after: number,
  locked: boolean,
  t: Pick<Tunables, "groupSize"> = DEFAULT_TUNABLES,
): LossVerdict {
  if (!(after < before)) throw new Error(`a loss makes a group smaller, not ${before} to ${after}`);
  if (locked) return { outcome: after >= t.groupSize.lockedMin ? "go_ahead" : "called_off", refill: false };
  return after >= t.groupSize.min ? { outcome: "stay", refill: true } : { outcome: "dissolve", refill: false };
}

/** The notice the members who are still in the group get. It carries the group and the kind only, never who left or why. */
export function lossNotice(outcome: LossOutcome): NoticeKind {
  switch (outcome) {
    case "stay":
    case "go_ahead":
      return "group_smaller";
    case "dissolve":
      return "group_changed";
    case "called_off":
      return "group_called_off";
  }
}
