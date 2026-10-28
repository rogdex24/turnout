import type { Database } from "bun:sqlite";
import { TERMINAL_PLAN_STATES } from "@turnout/contract/app/plans";
import { ulid } from "../utils/ulid.js";
import { getGroupForMember, withdrawPlan } from "./groups.js";
import type { MemberRow } from "./members.js";
import { canReadThread, threadWindow } from "./model/threadWindow.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { revokeAllSessions } from "./sessions.js";

const HOUR_MS = 60 * 60 * 1000;

export interface ReportRow {
  id: string;
  group_id: string;
  reporter_id: string;
  subject_id: string;
  message_id: string | null;
  body: string;
  client_id: string;
  reporter_gender: string | null;
  subject_gender: string | null;
  subject_status_before: string;
  status: "open" | "closed";
  outcome: "upheld" | "dismissed" | null;
  created_at: string;
  due_at: string;
  contacted_reporter_at: string | null;
  closed_at: string | null;
  close_note: string | null;
}

export const getReport = (db: Database, id: string): ReportRow | null =>
  db.query("SELECT * FROM report WHERE id = ?").get(id) as ReportRow | null;

/** The report this member already made under this `clientId`, if any. */
export const reportByClientId = (db: Database, reporterId: string, clientId: string): ReportRow | null =>
  db.query("SELECT * FROM report WHERE reporter_id = ? AND client_id = ?").get(reporterId, clientId) as ReportRow | null;

export interface ReportInput {
  groupId: string;
  memberRef: string;
  messageId?: string | undefined;
  body: string;
  clientId: string;
}

export type ReportCheck = { ok: true; subjectId: string } | { ok: false; error: "not_found" | "bad_message" };

/**
 * Whether this member may report this person now, without writing. The caller must be a current member of a group they can open,
 * between T-3h and the show plus 30 days (the window the thread can be read in). The person is found by their ref in that group,
 * whether or not they have since left it, so a second member can still report someone who is already out. An erased member's rows
 * are gone, so they cannot be found: `not_found`. Reporting yourself, a ref that is not in the group and any time outside the window
 * are all the same `not_found`. A `messageId` that is not one of that person's messages in that group is `bad_message`.
 */
export function checkReport(db: Database, reporterId: string, input: ReportInput, now: Date, t: Tunables = DEFAULT_TUNABLES): ReportCheck {
  const found = getGroupForMember(db, input.groupId, reporterId);
  if (found === null) return { ok: false, error: "not_found" };
  if (!canReadThread(threadWindow({ startsAt: found.group.starts_at, state: found.group.state }, now, t))) {
    return { ok: false, error: "not_found" };
  }
  const subject = db
    .query("SELECT member_id FROM group_member WHERE group_id = ? AND member_ref = ?")
    .get(input.groupId, input.memberRef) as {
    member_id: string;
  } | null;
  if (subject === null || subject.member_id === reporterId) return { ok: false, error: "not_found" };
  if (input.messageId !== undefined) {
    const message = db.query("SELECT member_id FROM message WHERE id = ? AND group_id = ?").get(input.messageId, input.groupId) as {
      member_id: string;
    } | null;
    if (message === null || message.member_id !== subject.member_id) return { ok: false, error: "bad_message" };
  }
  return { ok: true, subjectId: subject.member_id };
}

/**
 * What a suspension does besides the status: the person is signed out everywhere (and no device gets a push), their plans that are
 * not over are withdrawn through the loss rule, and they leave any group that is done. Nobody is told who. Withdrawn plans stay
 * withdrawn when the suspension is lifted.
 */
export function removeFromGroups(db: Database, memberId: string, now: Date, t: Tunables): void {
  revokeAllSessions(db, memberId, now);
  const open = db
    .query(`SELECT id FROM plan WHERE member_id = ? AND state NOT IN (${TERMINAL_PLAN_STATES.map(() => "?").join(", ")})`)
    .all(memberId, ...TERMINAL_PLAN_STATES) as { id: string }[];
  for (const plan of open) withdrawPlan(db, plan.id, "suspended", now, t);
  // A group that is done has no one to tell; the person is simply no longer a member of it.
  db.query(
    "UPDATE group_member SET left_at = ? WHERE member_id = ? AND left_at IS NULL AND group_id IN (SELECT id FROM show_group WHERE state = 'done')",
  ).run(now.toISOString(), memberId);
}

export type CreateReportResult = { ok: true; reportId: string; created: boolean } | { ok: false; error: "not_found" | "bad_message" };

const genderOf = (db: Database, memberId: string): string | null =>
  (db.query("SELECT gender FROM profile WHERE member_id = ?").get(memberId) as { gender: string | null } | null)?.gender ?? null;

/**
 * Stores a report and does everything it means in one transaction: the person is suspended, signed out everywhere, taken out of
 * every plan that is not over and out of any group that is done. A retried `clientId` returns the stored report and changes nothing.
 * Nobody but the operator is told. `body` is already trimmed and checked.
 *
 * The status the account had is kept on the report so a dismissal puts it back. When the person is already suspended by an earlier
 * open report, that report's status is carried forward; when an operator suspended them, it is `suspended`, which a dismissal leaves alone.
 */
export function createReport(
  db: Database,
  reporterId: string,
  input: ReportInput,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): CreateReportResult {
  return db
    .transaction((): CreateReportResult => {
      const existing = reportByClientId(db, reporterId, input.clientId);
      if (existing !== null) return { ok: true, reportId: existing.id, created: false };
      const check = checkReport(db, reporterId, input, now, t);
      if (!check.ok) return check;
      const at = now.toISOString();
      const subject = db.query("SELECT * FROM member WHERE id = ?").get(check.subjectId) as MemberRow;
      let before: string = subject.status;
      if (subject.status === "suspended") {
        const earlier = db
          .query(
            "SELECT subject_status_before AS before FROM report WHERE subject_id = ? AND status = 'open' ORDER BY created_at, id LIMIT 1",
          )
          .get(subject.id) as { before: string } | null;
        before = earlier?.before ?? "suspended";
      }
      const id = ulid(now);
      db.query(
        `INSERT INTO report (id, group_id, reporter_id, subject_id, message_id, body, client_id, reporter_gender, subject_gender,
           subject_status_before, created_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.groupId,
        reporterId,
        subject.id,
        input.messageId ?? null,
        input.body,
        input.clientId,
        genderOf(db, reporterId),
        genderOf(db, subject.id),
        before,
        at,
        new Date(now.getTime() + t.report.dueHours * HOUR_MS).toISOString(),
      );
      if (subject.status === "active" || subject.status === "stopped") {
        db.query("UPDATE member SET status = 'suspended', status_reason = 'report', updated_at = ? WHERE id = ?").run(at, subject.id);
      }
      removeFromGroups(db, subject.id, now, t);
      return { ok: true, reportId: id, created: true };
    })
    .immediate();
}

/** The operator's message for a new report. It carries the id and nothing about either person. */
export const newReportAlert = (reportId: string): { key: string; kind: string; text: string } => ({
  key: `report_new:${reportId}`,
  kind: `report_new:${reportId}`,
  text: `A member report is open and due within 24 hours. Report ${reportId}.`,
});

/**
 * What the operator must hear about for open reports: each new one once, one more `reAlertLeadHours` before it is due, and one every
 * hour once it is overdue. The hour index is in the key, so a pass that is late sends the current hour and not the ones it missed.
 * Texts carry the report id and the due time, never a name. The kind is the key, so the alert sender's once-an-hour rule for a kind
 * never swallows the next one.
 */
export function reportAlerts(
  db: Database,
  now: Date,
  t: Tunables,
  unsent: (key: string) => boolean,
): { key: string; kind: string; text: string }[] {
  const alerts: { key: string; kind: string; text: string }[] = [];
  const open = db.query("SELECT id, due_at FROM report WHERE status = 'open' ORDER BY due_at, id").all() as {
    id: string;
    due_at: string;
  }[];
  for (const report of open) {
    const dueMs = Date.parse(report.due_at);
    const fresh = newReportAlert(report.id);
    if (unsent(fresh.key)) alerts.push(fresh);
    if (now.getTime() < dueMs) {
      const key = `report_due_soon:${report.id}`;
      if (now.getTime() >= dueMs - t.report.reAlertLeadHours * HOUR_MS && unsent(key)) {
        alerts.push({ key, kind: key, text: `Report ${report.id} is due at ${report.due_at}.` });
      }
      continue;
    }
    const hours = Math.floor((now.getTime() - dueMs) / HOUR_MS);
    const key = `report_overdue:${report.id}:${hours}`;
    if (unsent(key)) alerts.push({ key, kind: key, text: `Report ${report.id} was due at ${report.due_at} and is still open.` });
  }
  return alerts;
}
