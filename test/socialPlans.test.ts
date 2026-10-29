import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "../src/migrate.js";
import { withdrawPlan } from "../src/social/groups.js";
import { getHandle } from "../src/social/handles.js";
import { DEFAULT_TUNABLES, type Tunables } from "../src/social/model/tunables.js";
import { addNotice, listNotices } from "../src/social/notices.js";
import { approveTicket, rejectTicket } from "../src/social/operator.js";
import { createPlan, getPlan, livePlanFor, movePlan } from "../src/social/plans.js";
import { getEligibleShow, lookingCount } from "../src/social/shows.js";
import { addTicket, dueTicketFiles, latestTicket, markTicketFileDeleted, reviewTicket, ticketQueue } from "../src/social/tickets.js";
import { openDb } from "../src/utils/openDb.js";
import { SHOW_START, seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-11-01T06:00:00Z");
const after = (ms: number) => new Date(NOW.getTime() + ms);
const HOUR = 3_600_000;

function setup(): { db: Database; member: string } {
  const db = memoryDb();
  seedShow(db, { id: "show-a" });
  return { db, member: seedMember(db, NOW) };
}

const noticeCount = (db: Database) => (db.query("SELECT COUNT(*) AS n FROM notice").get() as { n: number }).n;

function sendTicket(db: Database, planId: string, sha = `sha-${planId}`, now = NOW) {
  const plan = getPlan(db, planId);
  if (plan === null) throw new Error("no plan");
  const sent = addTicket(db, { plan, objectKey: `tickets/${planId}/${sha}.jpg`, mime: "image/jpeg", bytes: 900, sha256: sha, now });
  if (!sent.ok) throw new Error(sent.error);
  return sent.ticket;
}

test("a plan starts in needs_ticket with the show copied in", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  expect(made.plan).toMatchObject({
    state: "needs_ticket",
    reason: null,
    event_id: "show-a",
    show_title: "Show show-a",
    show_starts_at: SHOW_START,
    venue_name: "Hall show-a",
    group_id: null,
  });
  expect(made.plan.venue_lat).toBeCloseTo(17.4165);
  // A later change at the source does not move the plan.
  db.query("UPDATE event SET title = 'Renamed', starts_at = '2027-01-01T00:00:00.000Z' WHERE id = 'show-a'").run();
  expect(getPlan(db, made.plan.id)).toMatchObject({ show_title: "Show show-a", show_starts_at: SHOW_START });
});

test("a show that cannot have a group answers show_not_found", () => {
  const { db, member } = setup();
  seedShow(db, { id: "free", priceMin: 0 });
  seedShow(db, { id: "film", category: "film" });
  seedShow(db, { id: "soon", startsAt: after(20 * HOUR).toISOString() });
  for (const eventId of ["nope", "free", "film", "soon"]) {
    expect(createPlan(db, { memberId: member, eventId, groupType: "open", now: NOW })).toEqual({ ok: false, error: "show_not_found" });
  }
});

test("a member who is not ready gets what is missing; a pending handle is enough", () => {
  const { db } = setup();
  const noPhoto = seedMember(db, NOW, { photo: false, handle: "none" });
  expect(createPlan(db, { memberId: noPhoto, eventId: "show-a", groupType: "open", now: NOW })).toEqual({
    ok: false,
    error: "not_matchable",
    missing: ["photo", "handle"],
  });
  const pending = seedMember(db, NOW, { handle: "pending" });
  expect(createPlan(db, { memberId: pending, eventId: "show-a", groupType: "open", now: NOW }).ok).toBe(true);
  const rejected = seedMember(db, NOW, { handle: "rejected" });
  expect(createPlan(db, { memberId: rejected, eventId: "show-a", groupType: "open", now: NOW })).toMatchObject({
    error: "not_matchable",
    missing: ["handle"],
  });
});

test("women_only is for women and non-binary people", () => {
  const { db, member } = setup();
  expect(createPlan(db, { memberId: member, eventId: "show-a", groupType: "women_only", now: NOW })).toEqual({
    ok: false,
    error: "women_only",
  });
  const woman = seedMember(db, NOW, { gender: "woman" });
  expect(createPlan(db, { memberId: woman, eventId: "show-a", groupType: "women_only", now: NOW }).ok).toBe(true);
});

test("one live plan per member per show, and across the same show listed twice", () => {
  const { db, member } = setup();
  seedShow(db, { id: "show-b", dedupeGroupId: "same-show" });
  seedShow(db, { id: "show-c", dedupeGroupId: "same-show" });
  const first = createPlan(db, { memberId: member, eventId: "show-b", groupType: "open", now: NOW });
  if (!first.ok) throw new Error(first.error);
  expect(createPlan(db, { memberId: member, eventId: "show-c", groupType: "open", now: NOW })).toEqual({
    ok: false,
    error: "plan_exists",
    planId: first.plan.id,
  });
  expect(livePlanFor(db, member, "same-show")?.id).toBe(first.plan.id);
  // The database holds the rule too: a second live row for the key is refused.
  expect(() =>
    db
      .query(
        `INSERT INTO plan (id, member_id, event_id, dedupe_key, group_type, state, show_title, show_starts_at, venue_name, created_at, updated_at)
         VALUES ('dup', ?, 'show-c', 'same-show', 'open', 'needs_ticket', 't', ?, 'v', 'x', 'x')`,
      )
      .run(member, SHOW_START),
  ).toThrow();
  // A plan that ended frees the show for a new one.
  expect(withdrawPlan(db, first.plan.id, "cancelled", NOW).ok).toBe(true);
  expect(createPlan(db, { memberId: member, eventId: "show-c", groupType: "open", now: NOW }).ok).toBe(true);
});

test("a ticket moves the plan to checking, and one at a time", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const ticket = sendTicket(db, made.plan.id);
  expect(ticket).toMatchObject({ status: "pending", mime: "image/jpeg", file_deleted_at: null });
  expect(getPlan(db, made.plan.id)?.state).toBe("checking_ticket");
  const again = addTicket(db, {
    plan: getPlan(db, made.plan.id)!,
    objectKey: "tickets/x/b.jpg",
    mime: "image/jpeg",
    bytes: 10,
    sha256: "b",
    now: NOW,
  });
  expect(again).toEqual({ ok: false, error: "plan_closed" });
  expect(latestTicket(db, made.plan.id)?.id).toBe(ticket.id);
});

test("no ticket is taken from the lock on", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const lock = Date.parse(SHOW_START) - 24 * HOUR;
  const late = addTicket(db, {
    plan: made.plan,
    objectKey: "tickets/x/a.jpg",
    mime: "image/jpeg",
    bytes: 10,
    sha256: "a",
    now: new Date(lock),
  });
  expect(late).toEqual({ ok: false, error: "too_late" });
  const early = addTicket(db, {
    plan: made.plan,
    objectKey: "tickets/x/a.jpg",
    mime: "image/jpeg",
    bytes: 10,
    sha256: "a",
    now: new Date(lock - 1),
  });
  expect(early.ok).toBe(true);
});

test("approving moves the plan to finding_group and tells the member once", () => {
  const { db, member } = setup();
  const plan = waitingPlan(db, member, "show-a", NOW);
  expect(plan.state).toBe("finding_group");
  const notices = listNotices(db, member, undefined);
  expect(notices.map((n) => n.kind)).toEqual(["ticket_approved"]);
  expect(notices[0]).toMatchObject({ plan_id: plan.id, group_id: null, push_state: "pending" });
});

test("rejecting keeps the reason, tells the member, and lets them send another file", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const ticket = sendTicket(db, made.plan.id);
  const result = rejectTicket(db, ticket.id, "wrong_date", after(HOUR));
  expect(result.ok && result.plan.state).toBe("ticket_rejected");
  expect(latestTicket(db, made.plan.id)).toMatchObject({ status: "rejected", reject_reason: "wrong_date", reviewed_by: "operator" });
  expect(listNotices(db, member, undefined).map((n) => n.kind)).toEqual(["ticket_rejected"]);
  const next = sendTicket(db, made.plan.id, "second", after(2 * HOUR));
  expect(next.status).toBe("pending");
  expect(getPlan(db, made.plan.id)?.state).toBe("checking_ticket");
});

test("two operators answering at once change one row", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const ticket = sendTicket(db, made.plan.id);
  expect(approveTicket(db, ticket.id, after(HOUR)).ok).toBe(true);
  expect(rejectTicket(db, ticket.id, "unreadable", after(HOUR + 1))).toEqual({ ok: false, error: "not_pending" });
  expect(approveTicket(db, ticket.id, after(HOUR + 2))).toEqual({ ok: false, error: "not_pending" });
  expect(latestTicket(db, made.plan.id)).toMatchObject({ status: "approved", reject_reason: null, reviewed_at: after(HOUR).toISOString() });
  expect(getPlan(db, made.plan.id)?.state).toBe("finding_group");
  expect(noticeCount(db)).toBe(1);
  expect((db.query("SELECT COUNT(*) AS n FROM operator_action WHERE action LIKE 'ticket_%'").get() as { n: number }).n).toBe(1);
});

test("the plan's move is a compare-and-set on the old state", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const stale = { id: made.plan.id, state: made.plan.state };
  expect(movePlan(db, stale, { type: "ticket_uploaded" }, NOW)?.state).toBe("checking_ticket");
  expect(movePlan(db, stale, { type: "ticket_uploaded" }, NOW)).toBeNull();
  expect(getPlan(db, made.plan.id)?.state).toBe("checking_ticket");
  // A move the table does not allow is a bug, not a lost race.
  expect(() => movePlan(db, stale, { type: "ticket_approved" }, NOW)).toThrow();
  expect(() => movePlan(db, { id: made.plan.id, state: "done" }, { type: "ticket_uploaded" }, NOW)).toThrow();
});

test("an answer after T-24h is refused, so no one is promised a group that cannot form", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const ticket = sendTicket(db, made.plan.id);
  const lock = new Date(Date.parse(SHOW_START) - 24 * HOUR);
  expect(approveTicket(db, ticket.id, lock)).toEqual({ ok: false, error: "too_late" });
  expect(approveTicket(db, "missing", NOW)).toEqual({ ok: false, error: "not_found" });
  expect(latestTicket(db, made.plan.id)?.status).toBe("pending");
});

test("the notice goes in with the state change or not at all", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const ticket = sendTicket(db, made.plan.id);
  expect(() =>
    db.transaction(() => {
      reviewTicket(db, { ticketId: ticket.id, decision: { kind: "approve" }, reviewer: "operator", now: NOW });
      throw new Error("the process dies here");
    })(),
  ).toThrow();
  expect(noticeCount(db)).toBe(0);
  expect(getPlan(db, made.plan.id)?.state).toBe("checking_ticket");
  expect(latestTicket(db, made.plan.id)?.status).toBe("pending");
});

test("a notice for the same milestone is added once", () => {
  const { db, member } = setup();
  const notice = { memberId: member, kind: "no_group" as const, planId: null, groupId: null, dedupeKey: "no_group:p1", now: NOW };
  const first = addNotice(db, notice);
  expect(first).not.toBeNull();
  expect(addNotice(db, { ...notice, now: after(1000) })).toBeNull();
  expect(noticeCount(db)).toBe(1);
  expect((db.query("SELECT stale_after FROM notice").get() as { stale_after: string }).stale_after).toBe(
    after(6 * 60 * 60_000).toISOString(),
  );
});

test("the queue flags the same file sent for the same show by someone else, without naming them", () => {
  const { db, member } = setup();
  seedShow(db, { id: "show-b", dedupeGroupId: "other" });
  const other = seedMember(db, NOW);
  const third = seedMember(db, NOW);
  const mine = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  const theirs = createPlan(db, { memberId: other, eventId: "show-a", groupType: "open", now: NOW });
  const elsewhere = createPlan(db, { memberId: third, eventId: "show-b", groupType: "open", now: NOW });
  if (!mine.ok || !theirs.ok || !elsewhere.ok) throw new Error("plans");
  sendTicket(db, mine.plan.id, "same-bytes");
  sendTicket(db, theirs.plan.id, "same-bytes");
  sendTicket(db, elsewhere.plan.id, "same-bytes");
  const queue = ticketQueue(db, NOW);
  expect(queue).toHaveLength(3);
  const byPlan = new Map(queue.map((q) => [q.planId, q]));
  expect(byPlan.get(mine.plan.id)?.duplicates).toBe(1);
  expect(byPlan.get(theirs.plan.id)?.duplicates).toBe(1);
  expect(byPlan.get(elsewhere.plan.id)?.duplicates).toBe(0);
  const text = JSON.stringify(queue);
  for (const id of [member, other, third]) expect(text).not.toContain(id);
  expect(queue[0]?.lockAt).toBe(new Date(Date.parse(SHOW_START) - 24 * HOUR).toISOString());
});

test("the queue drops a ticket whose time to answer ran out", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  sendTicket(db, made.plan.id);
  expect(ticketQueue(db, NOW)).toHaveLength(1);
  expect(ticketQueue(db, new Date(Date.parse(SHOW_START) - 24 * HOUR))).toHaveLength(0);
});

test("ticket files go 24 hours after an unanswered rejection, at once when replaced or withdrawn, and 24 hours after the show", () => {
  const { db, member } = setup();
  const made = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const first = sendTicket(db, made.plan.id, "one");
  expect(dueTicketFiles(db, after(100 * HOUR))).toEqual([]);
  rejectTicket(db, first.id, "unreadable", after(HOUR));
  expect(dueTicketFiles(db, after(HOUR + 24 * HOUR - 1))).toEqual([]);
  expect(dueTicketFiles(db, after(HOUR + 24 * HOUR))).toEqual([{ ticketId: first.id, objectKey: first.object_key as string }]);
  // A newer file replaces the rejected one at once.
  const second = sendTicket(db, made.plan.id, "two", after(2 * HOUR));
  expect(dueTicketFiles(db, after(3 * HOUR)).map((d) => d.ticketId)).toEqual([first.id]);
  markTicketFileDeleted(db, first.id, after(3 * HOUR));
  expect(dueTicketFiles(db, after(3 * HOUR))).toEqual([]);
  expect(latestTicket(db, made.plan.id)?.id).toBe(second.id);
  const gone = db.query("SELECT object_key, sha256, file_deleted_at FROM ticket_proof WHERE id = ?").get(first.id);
  expect(gone).toEqual({ object_key: null, sha256: null, file_deleted_at: after(3 * HOUR).toISOString() });
  // The pending file goes the moment the plan is withdrawn.
  withdrawPlan(db, made.plan.id, "cancelled", after(4 * HOUR));
  expect(dueTicketFiles(db, after(4 * HOUR)).map((d) => d.ticketId)).toEqual([second.id]);
});

test("every file goes 24 hours after the show starts, whatever its state", () => {
  const { db, member } = setup();
  const plan = waitingPlan(db, member, "show-a", NOW);
  const approved = latestTicket(db, plan.id)!;
  const end = Date.parse(SHOW_START) + 24 * HOUR;
  expect(dueTicketFiles(db, new Date(end - 1))).toEqual([]);
  expect(dueTicketFiles(db, new Date(end)).map((d) => d.ticketId)).toEqual([approved.id]);
});

test("the handle fixture is the same state the matching rules read", () => {
  const { db } = setup();
  const approved = seedMember(db, NOW, { handle: "approved" });
  expect(getHandle(db, approved)?.status).toBe("approved");
  expect(getHandle(db, approved)?.reviewed_at).toBe(NOW.toISOString());
});

test("the show lookup follows the eligibility rules and the operator's time", () => {
  const { db } = setup();
  const show = getEligibleShow(db, "show-a", NOW);
  expect(show).toMatchObject({ id: "show-a", startsAt: SHOW_START, dedupeKey: "show-a", venueName: "Hall show-a" });
  expect(show?.joinUntil).toBe(new Date(Date.parse(SHOW_START) - 24 * HOUR).toISOString());
  expect(getEligibleShow(db, "show-a", new Date(Date.parse(SHOW_START) - 24 * HOUR))).toBeNull();
  db.query("UPDATE event SET status = 'delisted' WHERE id = 'show-a'").run();
  expect(getEligibleShow(db, "show-a", NOW)).toBeNull();
});

test("the looking count is the people waiting for a group, nobody else", () => {
  const { db } = setup();
  expect(lookingCount(db, "show-a")).toBe(0);
  waitingPlan(db, seedMember(db, NOW), "show-a", NOW);
  createPlan(db, { memberId: seedMember(db, NOW), eventId: "show-a", groupType: "open", now: NOW });
  expect(lookingCount(db, "show-a")).toBe(1);
});

/**
 * Two connections to one file. `probe` runs inside the first one's transaction, from a tunable it reads, and tries to start a write
 * on the second with no wait. A transaction that took the write lock at BEGIN makes that fail; a deferred one has not yet.
 */
function writeLockedDuring(run: (db: Database, tunables: Tunables) => void, seed: (db: Database) => void): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-lock-"));
  const first = openDb(path.join(dir, "a.db"));
  migrate(first);
  seed(first);
  const second = openDb(path.join(dir, "a.db"));
  second.exec("PRAGMA busy_timeout = 0");
  let locked = false;
  let probed = false;
  const probe = () => {
    if (probed) return;
    probed = true;
    try {
      second.exec("BEGIN IMMEDIATE");
      second.exec("ROLLBACK");
    } catch {
      locked = true;
    }
  };
  const tunables: Tunables = {
    ...DEFAULT_TUNABLES,
    get joinCutoffHours() {
      probe();
      return DEFAULT_TUNABLES.joinCutoffHours;
    },
  };
  try {
    run(first, tunables);
  } finally {
    first.close();
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return locked;
}

test("createPlan takes the write lock when it starts, so two requests for one show cannot read the same empty answer", () => {
  let member = "";
  const locked = writeLockedDuring(
    (db, t) => {
      expect(createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW }, t).ok).toBe(true);
    },
    (db) => {
      seedShow(db, { id: "show-a" });
      member = seedMember(db, NOW);
    },
  );
  expect(locked).toBe(true);
});

test("addTicket takes the write lock when it starts", () => {
  let planId = "";
  const locked = writeLockedDuring(
    (db, t) => {
      const plan = getPlan(db, planId) as NonNullable<ReturnType<typeof getPlan>>;
      const sent = addTicket(db, { plan, objectKey: "tickets/x/a.jpg", mime: "image/jpeg", bytes: 900, sha256: "sha-x", now: NOW }, t);
      expect(sent.ok).toBe(true);
    },
    (db) => {
      seedShow(db, { id: "show-a" });
      const made = createPlan(db, { memberId: seedMember(db, NOW), eventId: "show-a", groupType: "open", now: NOW });
      if (!made.ok) throw new Error(made.error);
      planId = made.plan.id;
    },
  );
  expect(locked).toBe(true);
});

test("a second live plan that slips past the read is plan_exists naming the first, not a constraint error", () => {
  const { db, member } = setup();
  const first = createPlan(db, { memberId: member, eventId: "show-a", groupType: "open", now: NOW });
  if (!first.ok) throw new Error(first.error);
  // A read that ran before the other request committed: it saw no live plan. Only that first read is stale.
  let stalePending = true;
  const stale = new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "query") return typeof value === "function" ? value.bind(target) : value;
      return (sql: string) => {
        const query = target.query(sql);
        if (!sql.startsWith("SELECT * FROM plan WHERE member_id = ? AND dedupe_key = ?")) return query;
        return {
          get: (...args: unknown[]) => {
            if (!stalePending) return query.get(...(args as never[]));
            stalePending = false;
            return null;
          },
        };
      };
    },
  });
  expect(createPlan(stale, { memberId: member, eventId: "show-a", groupType: "open", now: after(1000) })).toEqual({
    ok: false,
    error: "plan_exists",
    planId: first.plan.id,
  });
  expect(db.query("SELECT COUNT(*) AS n FROM plan").get()).toEqual({ n: 1 });
});
