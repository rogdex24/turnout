import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { Gender } from "@turnout/contract/profile";
import { pendingHandleCount, pendingHandles, upcomingShows } from "../src/social/adminReads.js";
import { runGroupingPass } from "../src/social/groups.js";
import { listNotices } from "../src/social/notices.js";
import { approveHandle, rejectHandle, setCafe, setStartTime } from "../src/social/operator.js";
import { createPlan, getPlan } from "../src/social/plans.js";
import { acquireLease, finishLease, leaseStatus, TICK_LEASE, tick } from "../src/social/tick.js";
import { SHOW_START, seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-11-01T06:00:00Z");
const HOUR = 3_600_000;
const START = Date.parse(SHOW_START);
const at = (ms: number) => new Date(START + ms);
const GENDERS: Gender[] = ["woman", "man", "woman", "man", "non_binary", "woman"];

function setup(people = 4): { db: Database; members: string[]; plans: string[] } {
  const db = memoryDb();
  seedShow(db, { id: "show-a" });
  const members: string[] = [];
  const plans: string[] = [];
  for (let i = 0; i < people; i++) {
    const m = seedMember(db, NOW, { gender: GENDERS[i % GENDERS.length] });
    members.push(m);
    plans.push(waitingPlan(db, m, "show-a", NOW).id);
  }
  return { db, members, plans };
}

const kinds = (db: Database, memberId: string) => listNotices(db, memberId, undefined).map((n) => n.kind);
const planStates = (db: Database, plans: string[]) => plans.map((p) => getPlan(db, p)?.state);

test("a show walked through the clock gives each member each notice exactly once, even with two ticks at one instant", () => {
  const { db, members, plans } = setup();
  const steps: [string, Date][] = [
    ["grouped", NOW],
    ["locked", at(-24 * HOUR)],
    ["revealed", at(-3 * HOUR)],
    ["head over", at(-90 * 60_000)],
    ["started", at(0)],
    ["morning after", new Date("2026-11-11T04:30:00Z")],
  ];
  const results = steps.map(([, when]) => {
    const first = tick(db, when);
    const second = tick(db, when);
    expect(second).toMatchObject({ withdrawn: 0, locked: 0, lapsed: 0, grouped: 0, revealed: 0, headOver: 0, finished: 0, alerts: [] });
    return first;
  });
  expect(results.map((r) => [r.grouped, r.locked, r.revealed, r.headOver, r.finished])).toEqual([
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 4, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 4],
  ]);
  for (const m of members) {
    expect(kinds(db, m)).toEqual(["ticket_approved", "group_confirmed", "meet_card_live", "head_over", "morning_after"]);
  }
  expect(planStates(db, plans)).toEqual(Array(4).fill("done"));
  expect(db.query("SELECT state FROM show_group").get()).toEqual({ state: "done" });
});

test("the reveal waits for T-3h and the head-over for T-90m", () => {
  const { db, members, plans } = setup();
  tick(db, NOW);
  tick(db, at(-24 * HOUR));
  tick(db, new Date(START - 3 * HOUR - 1));
  expect(planStates(db, plans)).toEqual(Array(4).fill("group_confirmed"));
  tick(db, at(-3 * HOUR));
  expect(planStates(db, plans)).toEqual(Array(4).fill("meet_card_live"));
  expect(kinds(db, members[0] as string)).not.toContain("head_over");
  tick(db, new Date(START - 90 * 60_000 - 1));
  expect(kinds(db, members[0] as string)).not.toContain("head_over");
  tick(db, at(-90 * 60_000));
  expect(kinds(db, members[0] as string)).toContain("head_over");
});

test("at the lock, plans that have no group end with the reason that fits where they stopped", () => {
  const { db } = setup(0);
  const mk = (handle: "approved" | "pending") => seedMember(db, NOW, { handle });
  const noTicket = createPlan(db, { memberId: mk("approved"), eventId: "show-a", groupType: "open", now: NOW });
  const waiting = waitingPlan(db, mk("approved"), "show-a", NOW);
  const handlePending = waitingPlan(db, mk("pending"), "show-a", NOW);
  const rejectedMember = mk("pending");
  const handleRejected = waitingPlan(db, rejectedMember, "show-a", NOW);
  rejectHandle(db, rejectedMember, "not_found", NOW);
  if (!noTicket.ok) throw new Error("plan");
  expect(tick(db, at(-24 * HOUR - 1)).lapsed).toBe(0);
  expect(tick(db, at(-24 * HOUR)).lapsed).toBe(4);
  expect(getPlan(db, noTicket.plan.id)).toMatchObject({ state: "no_group", reason: "no_ticket" });
  expect(getPlan(db, waiting.id)).toMatchObject({ state: "no_group", reason: "no_match" });
  expect(getPlan(db, handlePending.id)).toMatchObject({ state: "no_group", reason: "handle_pending" });
  expect(getPlan(db, handleRejected.id)).toMatchObject({ state: "no_group", reason: "handle_rejected" });
  const notice = db.query("SELECT * FROM notice WHERE kind = 'no_group' AND plan_id = ?").get(waiting.id) as { dedupe_key: string };
  expect(notice.dedupe_key).toBe(`no_group:${waiting.id}`);
  expect(tick(db, at(-23 * HOUR)).lapsed).toBe(0);
});

test("a suspended member's plan ends and the group is told only that it got smaller", () => {
  const { db, members, plans } = setup(5);
  tick(db, NOW);
  db.query("UPDATE member SET status = 'suspended' WHERE id = ?").run(members[0] as string);
  expect(tick(db, NOW).withdrawn).toBe(1);
  expect(getPlan(db, plans[0] as string)).toMatchObject({ state: "withdrawn", reason: "suspended" });
  expect(kinds(db, members[1] as string)).toContain("group_smaller");
  expect(tick(db, NOW).withdrawn).toBe(0);
});

test("a delisted show calls its groups off and withdraws the rest", () => {
  const { db, members, plans } = setup(5);
  tick(db, NOW);
  const extra = seedMember(db, NOW, { gender: "man" });
  const solo = waitingPlan(db, extra, "show-a", NOW);
  db.query("UPDATE event SET status = 'delisted' WHERE id = 'show-a'").run();
  tick(db, NOW);
  expect(planStates(db, plans)).toEqual(Array(5).fill("no_group"));
  expect(getPlan(db, plans[0] as string)?.reason).toBe("group_called_off");
  expect(getPlan(db, solo.id)).toMatchObject({ state: "withdrawn", reason: "delisted" });
  expect(kinds(db, members[0] as string)).toContain("group_called_off");
});

test("the cafe alert fires once at the lock and once at T-6h, and not after the cafe is set", () => {
  const { db } = setup();
  tick(db, NOW);
  expect(tick(db, at(-25 * HOUR)).alerts).toEqual([]);
  const lock = tick(db, at(-24 * HOUR)).alerts;
  expect(lock.map((a) => a.key.split(":")[0])).toEqual(["cafe_lock"]);
  expect(tick(db, at(-23 * HOUR)).alerts).toEqual([]);
  const late = tick(db, at(-6 * HOUR)).alerts;
  expect(late.map((a) => a.key.split(":")[0])).toEqual(["cafe_late"]);
  expect(tick(db, at(-5 * HOUR)).alerts).toEqual([]);
  const text = JSON.stringify([...lock, ...late]);
  expect(text).toContain("Show show-a");
  expect(text).not.toMatch(/Member\d|member_\d|\+1202/);
});

test("a group with a cafe raises no cafe alert", () => {
  const { db } = setup();
  tick(db, NOW);
  const group = db.query("SELECT id FROM show_group").get() as { id: string };
  setCafe(db, group.id, { name: "Cafe", address: null, lat: null, lng: null }, NOW);
  expect(tick(db, at(-24 * HOUR)).alerts).toEqual([]);
  expect(tick(db, at(-6 * HOUR)).alerts).toEqual([]);
});

test("a handle pending when its show is within 12 hours of the lock raises one alert, and no more once it is answered", () => {
  const { db } = setup(0);
  const pending = seedMember(db, NOW, { handle: "pending" });
  waitingPlan(db, pending, "show-a", NOW);
  const lock = START - 24 * HOUR;
  expect(tick(db, new Date(lock - 12 * HOUR - 1)).alerts).toEqual([]);
  const alerts = tick(db, new Date(lock - 12 * HOUR)).alerts;
  expect(alerts).toHaveLength(1);
  expect(alerts[0]?.key).toStartWith(`handle_due:${pending}:`);
  expect(tick(db, new Date(lock - 11 * HOUR)).alerts).toEqual([]);
});

test("the handle queue lists the earliest show first and counts what waits", () => {
  const { db } = setup(0);
  seedShow(db, { id: "late", startsAt: "2026-11-20T14:00:00.000Z" });
  const a = seedMember(db, NOW, { handle: "pending", name: "Ayesha" });
  const b = seedMember(db, NOW, { handle: "pending", name: "Bala" });
  const c = seedMember(db, NOW, { handle: "pending", name: "Chitra" });
  seedMember(db, NOW, { handle: "approved" });
  waitingPlan(db, a, "late", NOW);
  waitingPlan(db, b, "show-a", NOW);
  const queue = pendingHandles(db);
  expect(queue.map((q) => q.memberId)).toEqual([b, a, c]);
  expect(queue[0]).toMatchObject({ kind: "instagram", firstName: "Bala", lockAt: new Date(START - 24 * HOUR).toISOString() });
  expect(queue[2]).toMatchObject({ showStartsAt: null, lockAt: null });
  expect(pendingHandleCount(db)).toBe(3);
  db.query("UPDATE member SET status = 'suspended' WHERE id = ?").run(c);
  expect(pendingHandles(db).map((q) => q.memberId)).toEqual([b, a]);
  approveHandle(db, b, NOW);
  expect(pendingHandles(db).map((q) => q.memberId)).toEqual([a]);
});

test("the upcoming-shows list holds the pool, the groups and the operator's time", () => {
  const { db } = setup();
  seedShow(db, { id: "film", category: "film" });
  seedShow(db, { id: "free", priceMin: 0 });
  seedShow(db, { id: "dateonly", timeKind: "date-only", startsAt: "2026-11-15T00:00:00.000Z" });
  seedShow(db, { id: "past", startsAt: "2026-10-01T14:00:00.000Z" });
  tick(db, NOW);
  const shows = upcomingShows(db, NOW);
  expect(shows.map((s) => s.id)).toEqual(["show-a", "dateonly"]);
  expect(shows[0]).toMatchObject({
    waiting: 0,
    hasOverride: false,
    startsAt: SHOW_START,
    plans: { group_confirmed: 4 },
    joinUntil: new Date(START - 24 * HOUR).toISOString(),
  });
  expect(shows[0]?.groups).toHaveLength(1);
  expect(shows[0]?.groups[0]).toMatchObject({ state: "confirmed", size: 4, cafeName: null });
  expect(shows[1]?.timeKind).toBe("date-only");
  const moved = new Date(START + HOUR).toISOString();
  setStartTime(db, "dateonly", "2026-11-15T14:00:00.000Z", NOW);
  setStartTime(db, "show-a", moved, NOW);
  const after = upcomingShows(db, NOW);
  expect(after.find((s) => s.id === "show-a")).toMatchObject({ startsAt: moved, hasOverride: true });
  expect(after.find((s) => s.id === "dateonly")).toMatchObject({ hasOverride: true });
  // The sync can overwrite the source's time; the operator's stays.
  db.query("UPDATE event SET starts_at = '2026-12-01T14:00:00.000Z' WHERE id = 'show-a'").run();
  expect(upcomingShows(db, NOW).find((s) => s.id === "show-a")?.startsAt).toBe(moved);
});

test("one process holds the ticker lease at a time, and it is free again after a pass or when it runs out", () => {
  const db = memoryDb();
  expect(leaseStatus(db)).toBeNull();
  expect(acquireLease(db, TICK_LEASE, "a", NOW, 60)).toBe(true);
  expect(acquireLease(db, TICK_LEASE, "b", new Date(NOW.getTime() + 30_000), 60)).toBe(false);
  expect(acquireLease(db, TICK_LEASE, "a", new Date(NOW.getTime() + 30_000), 60)).toBe(true);
  expect(acquireLease(db, TICK_LEASE, "b", new Date(NOW.getTime() + 89_999), 60)).toBe(false);
  expect(acquireLease(db, TICK_LEASE, "b", new Date(NOW.getTime() + 90_000), 60)).toBe(true);
  expect(leaseStatus(db)).toMatchObject({ holder: "b", lastTickAt: null });
  const done = new Date(NOW.getTime() + 91_000);
  finishLease(db, TICK_LEASE, "b", done);
  expect(leaseStatus(db)).toMatchObject({ holder: "b", lastTickAt: done.toISOString() });
  expect(acquireLease(db, TICK_LEASE, "a", done, 60)).toBe(true);
  // A holder that lost the lease cannot mark a pass finished.
  finishLease(db, TICK_LEASE, "b", new Date(done.getTime() + 1000));
  expect(leaseStatus(db)?.lastTickAt).toBe(done.toISOString());
});

test("a grouping pass inside an outer transaction nests", () => {
  const { db } = setup();
  db.transaction(() => {
    expect(runGroupingPass(db, "show-a", NOW).created).toBe(1);
  }).immediate();
  expect((db.query("SELECT COUNT(*) AS n FROM show_group").get() as { n: number }).n).toBe(1);
});
