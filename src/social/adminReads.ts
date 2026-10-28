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

// ---- reports, accounts and failed notices (M4) ----

export interface PersonHistory {
  memberId: string;
  /** Null once the account is erased: the report still names the person by id only. */
  firstName: string | null;
  gender: string | null;
  status: string;
  statusReason: string | null;
  memberSince: string;
  showsDone: number;
  /** Reports about this person, by how they ended. Open ones include the one on screen. */
  reportsAbout: { open: number; upheld: number; dismissed: number };
  reportsMade: number;
  /** Only a count: who voted is never shown. */
  downvotesReceived: number;
}

/** One person's record. Null when there is no such member. */
export function personHistory(db: Database, memberId: string): PersonHistory | null {
  const row = db
    .query(
      `SELECT m.id AS memberId, p.first_name AS firstName, p.gender, m.status, m.status_reason AS statusReason, m.created_at AS memberSince
       FROM member m LEFT JOIN profile p ON p.member_id = m.id WHERE m.id = ?`,
    )
    .get(memberId) as Omit<PersonHistory, "showsDone" | "reportsAbout" | "reportsMade" | "downvotesReceived"> | null;
  if (row === null) return null;
  const count = (sql: string): number => (db.query(sql).get(memberId) as { n: number }).n;
  return {
    ...row,
    showsDone: count("SELECT COUNT(*) AS n FROM plan WHERE member_id = ?1 AND state = 'done'"),
    reportsAbout: {
      open: count("SELECT COUNT(*) AS n FROM report WHERE subject_id = ?1 AND status = 'open'"),
      upheld: count("SELECT COUNT(*) AS n FROM report WHERE subject_id = ?1 AND outcome = 'upheld'"),
      dismissed: count("SELECT COUNT(*) AS n FROM report WHERE subject_id = ?1 AND outcome = 'dismissed'"),
    },
    reportsMade: count("SELECT COUNT(*) AS n FROM report WHERE reporter_id = ?1"),
    downvotesReceived: count("SELECT COUNT(*) AS n FROM downvote WHERE target_id = ?1"),
  };
}

export interface ThreadLine {
  messageId: string;
  /** Who wrote it, by role in this report. The group's opaque names are not shown. */
  from: "reporter" | "subject" | "other";
  body: string;
  createdAt: string;
  reported: boolean;
}

export interface ReportItem {
  reportId: string;
  groupId: string;
  showTitle: string | null;
  showStartsAt: string;
  createdAt: string;
  dueAt: string;
  /** Negative once overdue. */
  minutesToDue: number;
  overdue: boolean;
  body: string;
  /** A report by a woman about a man cannot be closed until the operator has been in touch with her. */
  contactRequired: boolean;
  contactedReporterAt: string | null;
  reporter: PersonHistory;
  /** The reporter's number, so the operator can contact them. Null once the account is erased. */
  reporterPhone: string | null;
  subject: PersonHistory;
  /** The group's messages, oldest first, while they are kept (until 30 days after the show unless a report is open). */
  thread: ThreadLine[];
}

const THREAD_LIMIT = 300;

interface OpenReportRow {
  id: string;
  group_id: string;
  reporter_id: string;
  subject_id: string;
  message_id: string | null;
  body: string;
  reporter_gender: string | null;
  subject_gender: string | null;
  created_at: string;
  due_at: string;
  contacted_reporter_at: string | null;
}

/** Open reports, the one due first at the top, each with both people's record and the group's thread. */
export function reportQueue(db: Database, now: Date, limit = 100): ReportItem[] {
  const rows = db.query("SELECT * FROM report WHERE status = 'open' ORDER BY due_at, id LIMIT ?").all(limit) as OpenReportRow[];
  return rows.flatMap((r): ReportItem[] => {
    const reporter = personHistory(db, r.reporter_id);
    const subject = personHistory(db, r.subject_id);
    if (reporter === null || subject === null) return [];
    const group = db
      .query(
        "SELECT g.starts_at AS startsAt, (SELECT e.title FROM event e WHERE e.id = g.event_id) AS title FROM show_group g WHERE g.id = ?",
      )
      .get(r.group_id) as { startsAt: string; title: string | null } | null;
    const phone = (db.query("SELECT phone_e164 AS phone FROM member WHERE id = ?").get(r.reporter_id) as { phone: string | null }).phone;
    const thread = (
      db
        .query("SELECT id, member_id, body, created_at FROM message WHERE group_id = ? ORDER BY id LIMIT ?")
        .all(r.group_id, THREAD_LIMIT) as { id: string; member_id: string; body: string; created_at: string }[]
    ).map(
      (m): ThreadLine => ({
        messageId: m.id,
        from: m.member_id === r.reporter_id ? "reporter" : m.member_id === r.subject_id ? "subject" : "other",
        body: m.body,
        createdAt: m.created_at,
        reported: m.id === r.message_id,
      }),
    );
    const minutesToDue = Math.floor((Date.parse(r.due_at) - now.getTime()) / 60_000);
    return [
      {
        reportId: r.id,
        groupId: r.group_id,
        showTitle: group?.title ?? null,
        showStartsAt: group?.startsAt ?? "",
        createdAt: r.created_at,
        dueAt: r.due_at,
        minutesToDue,
        overdue: minutesToDue < 0,
        body: r.body,
        contactRequired: r.reporter_gender === "woman" && r.subject_gender === "man",
        contactedReporterAt: r.contacted_reporter_at,
        reporter,
        reporterPhone: phone,
        subject,
        thread,
      },
    ];
  });
}

export interface AccountDetail extends PersonHistory {
  phone: string | null;
  groupPref: string | null;
  handle: { kind: string; status: string } | null;
  activeSessions: number;
  devices: number;
  plans: { planId: string; showTitle: string; showStartsAt: string; state: string; reason: string | null }[];
  reports: { reportId: string; role: "reporter" | "subject"; status: string; outcome: string | null; createdAt: string }[];
  /** What the operator has done to this account: codes and times only. */
  actions: { action: string; createdAt: string }[];
}

/** One account for the operator. Null when there is no such member. */
export function accountDetail(db: Database, memberId: string): AccountDetail | null {
  const history = personHistory(db, memberId);
  if (history === null) return null;
  const member = db.query("SELECT phone_e164 AS phone FROM member WHERE id = ?").get(memberId) as { phone: string | null };
  const profile = db.query("SELECT group_pref AS groupPref FROM profile WHERE member_id = ?").get(memberId) as { groupPref: string } | null;
  const count = (sql: string): number => (db.query(sql).get(memberId) as { n: number }).n;
  return {
    ...history,
    phone: member.phone,
    groupPref: profile?.groupPref ?? null,
    handle: db.query("SELECT kind, status FROM social_handle WHERE member_id = ?").get(memberId) as { kind: string; status: string } | null,
    activeSessions: count("SELECT COUNT(*) AS n FROM auth_session WHERE member_id = ? AND revoked_at IS NULL"),
    devices: count("SELECT COUNT(*) AS n FROM device WHERE member_id = ? AND disabled_at IS NULL"),
    plans: db
      .query(
        "SELECT id AS planId, show_title AS showTitle, show_starts_at AS showStartsAt, state, reason FROM plan WHERE member_id = ? ORDER BY show_starts_at DESC, id LIMIT 50",
      )
      .all(memberId) as AccountDetail["plans"],
    reports: db
      .query(
        `SELECT id AS reportId, CASE WHEN reporter_id = ?1 THEN 'reporter' ELSE 'subject' END AS role, status, outcome, created_at AS createdAt
         FROM report WHERE reporter_id = ?1 OR subject_id = ?1 ORDER BY id DESC LIMIT 50`,
      )
      .all(memberId) as AccountDetail["reports"],
    actions: db
      .query(
        "SELECT action, created_at AS createdAt FROM operator_action WHERE subject_type = 'member' AND subject_id = ? ORDER BY id DESC LIMIT 50",
      )
      .all(memberId) as AccountDetail["actions"],
  };
}

export interface FailedNotice {
  noticeId: string;
  kind: string;
  memberId: string;
  createdAt: string;
  pushState: string;
  /** Deliveries the push service refused, and the codes it gave. */
  failedDeliveries: number;
  errorCodes: string[];
}

/**
 * Notices that did not reach a phone: closed as stale, with no device, or with only devices on a platform that is not sending, or
 * with a delivery the push service refused. Newest first. The notice text is not here, only its kind.
 */
export function failedNotices(db: Database, limit = 200): FailedNotice[] {
  const rows = db
    .query(
      `SELECT n.id AS noticeId, n.kind, n.member_id AS memberId, n.created_at AS createdAt, n.push_state AS pushState,
              (SELECT COUNT(*) FROM push_delivery d WHERE d.notice_id = n.id AND d.status = 'failed') AS failedDeliveries,
              (SELECT group_concat(DISTINCT d.error_code) FROM push_delivery d WHERE d.notice_id = n.id AND d.status = 'failed' AND d.error_code IS NOT NULL) AS codes
       FROM notice n
       WHERE n.push_state IN ('stale', 'no_device', 'not_sent')
          OR EXISTS (SELECT 1 FROM push_delivery d WHERE d.notice_id = n.id AND d.status = 'failed')
       ORDER BY n.id DESC LIMIT ?`,
    )
    .all(limit) as (Omit<FailedNotice, "errorCodes"> & { codes: string | null })[];
  return rows.map(({ codes, ...n }) => ({ ...n, errorCodes: codes === null ? [] : codes.split(",").sort() }));
}
