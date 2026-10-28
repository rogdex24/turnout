import type { FileLink } from "@turnout/contract/app/me";
import type { Plan } from "@turnout/contract/app/plans";
import { addMinutes } from "../social/dates.js";
import { getGroup, groupSize } from "../social/groups.js";
import { revealAt } from "../social/model/schedule.js";
import { type PlanRow, planLockAt } from "../social/plans.js";
import { latestTicket } from "../social/tickets.js";
import type { AppContext } from "./context.js";

/** A signed link to a stored file, good for the file-link time (5 minutes). */
export function fileLink(app: AppContext, key: string, now: Date): FileLink {
  return { url: app.store.linkFor(key), expiresAt: addMinutes(now, app.config.tunables.fileLinkMinutes).toISOString() };
}

/**
 * A plan as the app sees it. The group part is only the state, the size and when the reveal comes: never a co-member. The ticket
 * part is only its state and the reason: never the file, its key or a link to it.
 */
export function planView(app: AppContext, plan: PlanRow): Plan {
  const t = app.config.tunables;
  const ticket = latestTicket(app.db, plan.id);
  const group = plan.group_id === null ? null : getGroup(app.db, plan.group_id);
  const open =
    group !== null && (group.state === "confirmed" || group.state === "locked" || group.state === "live" || group.state === "done");
  return {
    id: plan.id,
    eventId: plan.event_id,
    state: plan.state,
    reason: plan.reason,
    groupType: plan.group_type,
    show: { title: plan.show_title, startsAt: plan.show_starts_at, venueName: plan.venue_name },
    ticket: ticket === null ? null : { state: ticket.status, rejectReason: ticket.reject_reason },
    joinUntil: planLockAt(plan, t),
    group: open
      ? {
          id: group.id,
          state: group.state as "confirmed" | "locked" | "live" | "done",
          size: groupSize(app.db, group.id),
          revealAt: revealAt(group.starts_at, t),
        }
      : null,
    createdAt: plan.created_at,
  };
}
