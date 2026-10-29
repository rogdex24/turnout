import type { Database } from "bun:sqlite";
import { ulidAfter } from "../utils/ulid.js";
import { addMinutes } from "./dates.js";
import { currentMembers, getGroupForMember } from "./groups.js";
import { canPostThread, canReadThread, type ThreadWindow, threadWindow } from "./model/threadWindow.js";
import { DEFAULT_TUNABLES, type Tunables } from "./model/tunables.js";
import { addNotice } from "./notices.js";

export const MESSAGE_PAGE = 100;

export interface ThreadMessage {
  id: string;
  memberRef: string;
  firstName: string;
  body: string;
  createdAt: string;
  isYou: boolean;
}

interface MessageRow {
  id: string;
  group_id: string;
  member_id: string;
  member_ref: string;
  client_id: string;
  body: string;
  created_at: string;
  first_name: string | null;
}

const SELECT_MESSAGE = `SELECT m.*, p.first_name FROM message m LEFT JOIN profile p ON p.member_id = m.member_id`;

const view = (row: MessageRow, viewerId: string): ThreadMessage => ({
  id: row.id,
  memberRef: row.member_ref,
  firstName: row.first_name ?? "",
  body: row.body,
  createdAt: row.created_at,
  isYou: row.member_id === viewerId,
});

export type ListResult = { ok: true; messages: ThreadMessage[]; thread: "open" | "read_only" } | { ok: false; error: "not_found" };

/**
 * Up to 100 messages newer than `after`, oldest first, for a current member of the group once the thread is open (T-3h) and
 * until it is gone (the show plus 30 days). Reading counts as being in the thread, so the notice rule knows who is away.
 * Anyone else, and any time outside that, is `not_found`: the same answer as a group that is not theirs.
 */
export function listMessages(
  db: Database,
  groupId: string,
  memberId: string,
  after: string | undefined,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): ListResult {
  const found = getGroupForMember(db, groupId, memberId);
  if (found === null) return { ok: false, error: "not_found" };
  const window = threadWindow({ startsAt: found.group.starts_at, state: found.group.state }, now, t);
  if (!canReadThread(window)) return { ok: false, error: "not_found" };
  db.query(
    `INSERT INTO thread_presence (group_id, member_id, seen_at) VALUES (?, ?, ?)
     ON CONFLICT (group_id, member_id) DO UPDATE SET seen_at = excluded.seen_at`,
  ).run(groupId, memberId, now.toISOString());
  const rows = db
    .query(`${SELECT_MESSAGE} WHERE m.group_id = ? AND m.id > ? ORDER BY m.id LIMIT ?`)
    .all(groupId, after ?? "", MESSAGE_PAGE) as MessageRow[];
  return { ok: true, messages: rows.map((row) => view(row, memberId)), thread: window as "open" | "read_only" };
}

export type PostResult =
  | { ok: true; message: ThreadMessage; created: boolean }
  | { ok: false; error: "not_found" | "closed" | "client_id_reused" };

/** Whether the caller may post now, without writing anything. The route uses it to rate limit only what would be stored. */
export function postWindow(
  db: Database,
  groupId: string,
  memberId: string,
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): "not_found" | "closed" | "open" {
  const found = getGroupForMember(db, groupId, memberId);
  if (found === null) return "not_found";
  const window: ThreadWindow = threadWindow({ startsAt: found.group.starts_at, state: found.group.state }, now, t);
  if (window === "before" || window === "gone") return "not_found";
  return canPostThread(window) ? "open" : "closed";
}

/** The message this member already stored in this group under this `clientId`, if any. */
export function messageByClientId(db: Database, groupId: string, memberId: string, clientId: string): ThreadMessage | null {
  const row = db
    .query(`${SELECT_MESSAGE} WHERE m.group_id = ? AND m.member_id = ? AND m.client_id = ?`)
    .get(groupId, memberId, clientId) as MessageRow | null;
  return row === null ? null : view(row, memberId);
}

/**
 * Stores a message from a current member while the thread is open (T-3h to T+24h). A retried `clientId` returns the stored message
 * and writes nothing. The notice for the others is inserted in the same transaction. `body` is already trimmed and checked.
 */
export function postMessage(
  db: Database,
  groupId: string,
  memberId: string,
  input: { body: string; clientId: string },
  now: Date,
  t: Tunables = DEFAULT_TUNABLES,
): PostResult {
  return db
    .transaction((): PostResult => {
      const found = getGroupForMember(db, groupId, memberId);
      if (found === null) return { ok: false, error: "not_found" };
      const window = threadWindow({ startsAt: found.group.starts_at, state: found.group.state }, now, t);
      if (window === "before" || window === "gone") return { ok: false, error: "not_found" };
      if (!canPostThread(window)) return { ok: false, error: "closed" };
      const existing = db.query("SELECT group_id FROM message WHERE member_id = ? AND client_id = ?").get(memberId, input.clientId) as {
        group_id: string;
      } | null;
      if (existing !== null) {
        if (existing.group_id !== groupId) return { ok: false, error: "client_id_reused" };
        return { ok: true, message: messageByClientId(db, groupId, memberId, input.clientId) as ThreadMessage, created: false };
      }
      // `now` was read before the body arrived, so another post may have been stored since with a later id. The cursor is the id, so a
      // new message must sort after the group's newest (the transaction is immediate: nobody else writes between this read and the insert).
      const newest = db.query("SELECT MAX(id) AS id FROM message WHERE group_id = ?").get(groupId) as { id: string | null };
      const id = ulidAfter(newest.id ?? "", now);
      db.query("INSERT INTO message (id, group_id, member_id, member_ref, client_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id,
        groupId,
        memberId,
        found.mine.member_ref,
        input.clientId,
        input.body,
        now.toISOString(),
      );
      // The sender has the thread open, so they are not away.
      db.query(
        `INSERT INTO thread_presence (group_id, member_id, seen_at) VALUES (?, ?, ?)
         ON CONFLICT (group_id, member_id) DO UPDATE SET seen_at = excluded.seen_at`,
      ).run(groupId, memberId, now.toISOString());
      notifyAway(db, groupId, memberId, id, now, t);
      const row = db.query(`${SELECT_MESSAGE} WHERE m.id = ?`).get(id) as MessageRow;
      return { ok: true, message: view(row, memberId), created: true };
    })
    .immediate();
}

/**
 * A `thread_message` notice for each other current member who has not read the thread for `awayMinutes`, at most one per plan in
 * `noticeEveryMinutes`. The notice names nobody and holds no text: the app fetches the thread.
 */
function notifyAway(db: Database, groupId: string, senderId: string, messageId: string, now: Date, t: Tunables): void {
  const awayBefore = addMinutes(now, -t.thread.awayMinutes).toISOString();
  const recentAfter = addMinutes(now, -t.thread.noticeEveryMinutes).toISOString();
  for (const other of currentMembers(db, groupId)) {
    if (other.member_id === senderId) continue;
    const seen = db.query("SELECT seen_at FROM thread_presence WHERE group_id = ? AND member_id = ?").get(groupId, other.member_id) as {
      seen_at: string;
    } | null;
    if (seen !== null && seen.seen_at > awayBefore) continue;
    const recent = db
      .query("SELECT 1 FROM notice WHERE plan_id = ? AND kind = 'thread_message' AND created_at > ? LIMIT 1")
      .get(other.plan_id, recentAfter);
    if (recent !== null) continue;
    addNotice(
      db,
      {
        memberId: other.member_id,
        kind: "thread_message",
        planId: other.plan_id,
        groupId,
        dedupeKey: `thread_message:${other.plan_id}:${messageId}`,
        now,
      },
      t,
    );
  }
}

/**
 * Deletes messages for groups whose show started `messageRetentionDaysAfterStart` ago, except where a report on the group is open
 * (the operator may need to read them; they go on the next sweep after it closes). Returns how many messages were deleted.
 */
export function deleteExpiredMessages(db: Database, now: Date, t: Tunables = DEFAULT_TUNABLES): number {
  const cutoff = addMinutes(now, -t.plan.messageRetentionDaysAfterStart * 24 * 60).toISOString();
  return db.transaction(() => {
    const expired = `SELECT id FROM show_group WHERE starts_at <= ? AND id NOT IN (SELECT group_id FROM report WHERE status = 'open')`;
    const deleted = db.query(`DELETE FROM message WHERE group_id IN (${expired})`).run(cutoff).changes;
    db.query(`DELETE FROM thread_presence WHERE group_id IN (${expired})`).run(cutoff);
    return deleted;
  })();
}
