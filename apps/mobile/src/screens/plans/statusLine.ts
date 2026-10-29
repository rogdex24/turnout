import { plans } from "@/copy/plans";
import type { PlanStatus } from "@/model/planStatus";

/** The words for a plan's status, on the Plans tab and the Home bar. */
export function statusText(status: PlanStatus): string {
  if (status.key === "done") return plans.status.done(status.others);
  return plans.status[status.key];
}
