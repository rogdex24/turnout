import type { Database } from "bun:sqlite";
import { joinUntil } from "./model/eligibility.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";

export interface UpcomingGroup {
  id: string;
  state: string;
  groupType: string;
  size: number;
  startsAt: string;
  cafeName: string | null;
}

export interface UpcomingShow {
  id: string;
  title: string;
  /** The operator's time when there is one, else the source's. */
  startsAt: string;
  joinUntil: string;
  timeKind: "timed" | "date-only";
  hasOverride: boolean;
  area: string;
  venueName: string | null;
  /** Plans by state: what is in the pool and what is not. */
  plans: Record<string, number>;
  waiting: number;
  groups: UpcomingGroup[];
}

/**
 * Shows an operator may need to act on: comedy, music and theatre that are not free and cost the minimum or more, on a placed venue, that have not
 * started, with the plans and groups they hold. A date-only show is listed too, since it needs a start time before anyone can plan it.
 */
export function upcomingShows(db: Database, now: Date, limit = 200, t: Tunables = DEFAULT_TUNABLES): UpcomingShow[] {
  const categories = t.eligibleCategories.map(() => "?").join(", ");
  const rows = db
    .query(
      `SELECT e.id, e.title, e.starts_at AS sourceStartsAt, o.starts_at AS overrideStartsAt, e.time_kind AS timeKind, e.area, e.venue_name AS venueName
       FROM listable_event e JOIN venue v ON v.id = e.venue_id LEFT JOIN start_override o ON o.event_id = e.id
       WHERE e.category IN (${categories}) AND e.is_free = 0 AND e.price_min >= ? AND v.geocode_state IN ('resolved', 'approximate', 'manual')
       ORDER BY COALESCE(o.starts_at, e.starts_at), e.id`,
    )
    .all(...t.eligibleCategories, t.minPriceInr) as {
    id: string;
    title: string;
    sourceStartsAt: string;
    overrideStartsAt: string | null;
    timeKind: "timed" | "date-only";
    area: string;
    venueName: string | null;
  }[];
  const planCounts = db.query("SELECT state, COUNT(*) AS n FROM plan WHERE event_id = ? GROUP BY state");
  const groups = db.query(
    `SELECT g.id, g.state, g.group_type AS groupType, g.starts_at AS startsAt, g.cafe_name AS cafeName,
            (SELECT COUNT(*) FROM group_member gm WHERE gm.group_id = g.id AND gm.left_at IS NULL) AS size
     FROM show_group g WHERE g.event_id = ? AND g.state IN ('confirmed', 'locked', 'live', 'done') ORDER BY g.id`,
  );
  const shows: UpcomingShow[] = [];
  for (const row of rows) {
    const startsAt = row.overrideStartsAt ?? row.sourceStartsAt;
    if (Date.parse(startsAt) <= now.getTime()) continue;
    const plans: Record<string, number> = {};
    for (const c of planCounts.all(row.id) as { state: string; n: number }[]) plans[c.state] = c.n;
    shows.push({
      id: row.id,
      title: row.title,
      startsAt,
      joinUntil: joinUntil(startsAt, t),
      timeKind: row.timeKind,
      hasOverride: row.overrideStartsAt !== null,
      area: row.area,
      venueName: row.venueName,
      plans,
      waiting: plans.finding_group ?? 0,
      groups: groups.all(row.id) as UpcomingGroup[],
    });
    if (shows.length >= limit) break;
  }
  return shows;
}

export interface PendingHandle {
  memberId: string;
  kind: string;
  handle: string;
  submittedAt: string;
  firstName: string | null;
  photoKey: string | null;
  /** The earliest show among the member's plans that are still open, and when it locks. Null when they have none. */
  showStartsAt: string | null;
  lockAt: string | null;
}

/** Handles waiting for a review, the one whose show locks first at the top. */
export function pendingHandles(db: Database, limit = 100, t: Tunables = DEFAULT_TUNABLES): PendingHandle[] {
  const rows = db
    .query(
      `SELECT h.member_id AS memberId, h.kind, h.handle, h.submitted_at AS submittedAt, p.first_name AS firstName, p.photo_key AS photoKey,
              (SELECT MIN(pl.show_starts_at) FROM plan pl WHERE pl.member_id = h.member_id
                 AND pl.state IN ('needs_ticket', 'checking_ticket', 'ticket_rejected', 'finding_group')) AS showStartsAt
       FROM social_handle h LEFT JOIN profile p ON p.member_id = h.member_id
       JOIN member m ON m.id = h.member_id AND m.status = 'active'
       WHERE h.status = 'pending'`,
    )
    .all() as Omit<PendingHandle, "lockAt">[];
  return rows
    .map((r) => ({ ...r, lockAt: r.showStartsAt === null ? null : joinUntil(r.showStartsAt, t) }))
    .sort(
      (a, b) =>
        Number(a.showStartsAt === null) - Number(b.showStartsAt === null) ||
        (a.showStartsAt ?? "").localeCompare(b.showStartsAt ?? "") ||
        a.submittedAt.localeCompare(b.submittedAt) ||
        a.memberId.localeCompare(b.memberId),
    )
    .slice(0, limit);
}

/** How many handles are waiting, for the admin home. */
export const pendingHandleCount = (db: Database): number =>
  (db.query("SELECT COUNT(*) AS n FROM social_handle WHERE status = 'pending'").get() as { n: number }).n;
