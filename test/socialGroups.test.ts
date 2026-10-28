import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { Gender } from "@turnout/contract/profile";
import {
  checkIn,
  currentMembers,
  getGroup,
  getGroupForMember,
  groupSize,
  memberPhotoKey,
  revealedMembers,
  runGroupingPass,
  withdrawPlan,
} from "../src/social/groups.js";
import { listNotices } from "../src/social/notices.js";
import { approveHandle, rejectHandle, setCafe, setStartTime } from "../src/social/operator.js";
import { getPlan } from "../src/social/plans.js";
import { SHOW_START, seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-11-01T06:00:00Z");
const HOUR = 3_600_000;
const START = Date.parse(SHOW_START);
const GENDERS: Gender[] = ["woman", "man", "woman", "man", "non_binary", "woman", "man", "woman"];

interface Waiting {
  memberId: string;
  planId: string;
}

function setup(): Database {
  const db = memoryDb();
  seedShow(db, { id: "show-a" });
  return db;
}

/** `n` members, mixed so the gender caps allow them in one group, each waiting for a group at NOW. */
function wait(db: Database, n: number, eventId = "show-a", from = 0): Waiting[] {
  return Array.from({ length: n }, (_, i) => {
    const memberId = seedMember(db, NOW, { gender: GENDERS[(from + i) % GENDERS.length] });
    return { memberId, planId: waitingPlan(db, memberId, eventId, NOW).id };
  });
}

const states = (db: Database, who: Waiting[]) => who.map((w) => getPlan(db, w.planId)?.state);
const kinds = (db: Database, memberId: string) => listNotices(db, memberId, undefined).map((n) => n.kind);
const onlyGroup = (db: Database) =>
  db.query("SELECT * FROM show_group").get() as { id: string; state: string; meet_at: string; starts_at: string };

test("four waiting people make a group, three do not", () => {
  const db = setup();
  const three = wait(db, 3);
  expect(runGroupingPass(db, "show-a", NOW)).toEqual({ created: 0, joined: 0 });
  expect(states(db, three)).toEqual(["finding_group", "finding_group", "finding_group"]);
  const [fourth] = wait(db, 1, "show-a", 3);
  expect(runGroupingPass(db, "show-a", NOW)).toEqual({ created: 1, joined: 0 });
  const group = onlyGroup(db);
  expect(group).toMatchObject({ state: "confirmed", starts_at: SHOW_START, meet_at: new Date(START - HOUR).toISOString() });
  expect(states(db, [...three, fourth as Waiting])).toEqual(Array(4).fill("group_confirmed"));
  expect(groupSize(db, group.id)).toBe(4);
  for (const w of three) expect(kinds(db, w.memberId)).toEqual(["ticket_approved", "group_confirmed"]);
});

test("running the pass again at the same instant changes nothing", () => {
  const db = setup();
  wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  expect(runGroupingPass(db, "show-a", NOW)).toEqual({ created: 0, joined: 0 });
  expect((db.query("SELECT COUNT(*) AS n FROM show_group").get() as { n: number }).n).toBe(1);
  expect((db.query("SELECT COUNT(*) AS n FROM notice WHERE kind = 'group_confirmed'").get() as { n: number }).n).toBe(4);
});

test("a person whose handle is still pending waits outside the pool until it is approved", () => {
  const db = setup();
  wait(db, 3);
  const pending = seedMember(db, NOW, { handle: "pending", gender: "man" });
  const plan = waitingPlan(db, pending, "show-a", NOW);
  expect(runGroupingPass(db, "show-a", NOW)).toEqual({ created: 0, joined: 0 });
  expect(getPlan(db, plan.id)?.state).toBe("finding_group");
  expect(approveHandle(db, pending, NOW)).toEqual({ ok: true });
  expect(getPlan(db, plan.id)?.state).toBe("group_confirmed");
  expect(onlyGroup(db).state).toBe("confirmed");
});

test("a rejected handle leaves the member waiting and is told once", () => {
  const db = setup();
  const pending = seedMember(db, NOW, { handle: "pending" });
  waitingPlan(db, pending, "show-a", NOW);
  expect(rejectHandle(db, pending, "not_found", NOW)).toEqual({ ok: true });
  expect(rejectHandle(db, pending, "not_found", NOW)).toEqual({ ok: false, error: "not_pending" });
  expect(kinds(db, pending)).toEqual(["ticket_approved", "handle_rejected"]);
});

test("each show has its own pass and its own groups", () => {
  const db = setup();
  seedShow(db, { id: "show-b" });
  wait(db, 4, "show-a");
  wait(db, 4, "show-b");
  expect(runGroupingPass(db, "show-a", NOW).created).toBe(1);
  expect(runGroupingPass(db, "show-b", NOW).created).toBe(1);
  expect(db.query("SELECT DISTINCT event_id FROM show_group ORDER BY event_id").all()).toEqual([
    { event_id: "show-a" },
    { event_id: "show-b" },
  ]);
});

test("a late arrival joins a confirmed group that has room", () => {
  const db = setup();
  wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  const [late] = wait(db, 1, "show-a", 4);
  expect(runGroupingPass(db, "show-a", NOW)).toEqual({ created: 0, joined: 1 });
  expect(getPlan(db, (late as Waiting).planId)?.state).toBe("group_confirmed");
  expect(groupSize(db, onlyGroup(db).id)).toBe(5);
});

test("the pass does nothing from the lock on", () => {
  const db = setup();
  wait(db, 4);
  expect(runGroupingPass(db, "show-a", new Date(START - 24 * HOUR))).toEqual({ created: 0, joined: 0 });
});

test("before the lock, a group of five that loses one stays and the others are told only that it got smaller", () => {
  const db = setup();
  const people = wait(db, 5);
  runGroupingPass(db, "show-a", NOW);
  const [leaver, ...rest] = people as [Waiting, ...Waiting[]];
  expect(withdrawPlan(db, leaver.planId, "cancelled", NOW).ok).toBe(true);
  expect(getPlan(db, leaver.planId)).toMatchObject({ state: "withdrawn", reason: "cancelled", group_id: null });
  expect(groupSize(db, onlyGroup(db).id)).toBe(4);
  for (const w of rest) expect(kinds(db, w.memberId)).toContain("group_smaller");
  expect(kinds(db, leaver.memberId)).not.toContain("group_smaller");
  expect(states(db, rest)).toEqual(Array(4).fill("group_confirmed"));
});

test("before the lock, a group of four that loses one dissolves and everyone goes back to finding", () => {
  const db = setup();
  const people = wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  const [leaver, ...rest] = people as [Waiting, ...Waiting[]];
  withdrawPlan(db, leaver.planId, "stopped", NOW);
  expect(onlyGroup(db).state).toBe("dissolved");
  expect(states(db, rest)).toEqual(Array(3).fill("finding_group"));
  for (const w of rest) {
    expect(getPlan(db, w.planId)?.group_id).toBeNull();
    expect(kinds(db, w.memberId)).toContain("group_changed");
  }
  // They can be grouped again when someone else comes.
  wait(db, 1, "show-a", 4);
  expect(runGroupingPass(db, "show-a", NOW).created).toBe(1);
});

test("after the lock, three go ahead and fewer are called off", () => {
  const db = setup();
  const people = wait(db, 5);
  runGroupingPass(db, "show-a", NOW);
  const lockedAt = new Date(START - 24 * HOUR);
  db.query("UPDATE show_group SET state = 'locked'").run();
  const [a, b, c, d, e] = people as [Waiting, Waiting, Waiting, Waiting, Waiting];
  withdrawPlan(db, a.planId, "cancelled", lockedAt);
  withdrawPlan(db, b.planId, "cancelled", lockedAt);
  expect(onlyGroup(db).state).toBe("locked");
  expect(groupSize(db, onlyGroup(db).id)).toBe(3);
  for (const w of [c, d, e]) expect(kinds(db, w.memberId)).toContain("group_smaller");
  withdrawPlan(db, c.planId, "cancelled", lockedAt);
  expect(onlyGroup(db).state).toBe("called_off");
  for (const w of [d, e]) {
    expect(getPlan(db, w.planId)).toMatchObject({ state: "no_group", reason: "group_called_off", group_id: null });
    expect(kinds(db, w.memberId)).toContain("group_called_off");
  }
});

test("a loss notice holds no id, name, handle or reason of anyone else", () => {
  const db = setup();
  const people = wait(db, 5);
  runGroupingPass(db, "show-a", NOW);
  const [leaver, stayer] = people as [Waiting, Waiting];
  withdrawPlan(db, leaver.planId, "banned", NOW);
  const rows = db.query("SELECT * FROM notice WHERE member_id = ? AND kind = 'group_smaller'").all(stayer.memberId);
  expect(rows).toHaveLength(1);
  const text = JSON.stringify(rows);
  expect(text).not.toContain(leaver.memberId);
  expect(text).not.toContain("banned");
  expect(text).not.toContain("Member");
  expect(text).not.toMatch(/member_\d/);
});

test("withdrawing twice, or a plan that does not exist, is told apart", () => {
  const db = setup();
  const [w] = wait(db, 1) as [Waiting];
  expect(withdrawPlan(db, "nope", "cancelled", NOW)).toEqual({ ok: false, error: "not_found" });
  expect(withdrawPlan(db, w.planId, "cancelled", NOW).ok).toBe(true);
  expect(withdrawPlan(db, w.planId, "cancelled", NOW)).toEqual({ ok: false, error: "plan_closed" });
});

test("group members carry an opaque ref per group, and only current members open the group", () => {
  const db = setup();
  const people = wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  const group = onlyGroup(db);
  const [a, b] = people as [Waiting, Waiting];
  const mine = getGroupForMember(db, group.id, a.memberId);
  expect(mine?.mine.member_ref).toMatch(/^[0-9a-f]{16}$/);
  expect(getGroupForMember(db, group.id, a.memberId)?.mine.member_ref).toBe(mine?.mine.member_ref);
  const outsider = seedMember(db, NOW);
  expect(getGroupForMember(db, group.id, outsider)).toBeNull();
  const revealed = revealedMembers(db, group.id, a.memberId);
  expect(revealed).toHaveLength(4);
  expect(revealed.filter((r) => r.isYou).map((r) => r.memberRef)).toEqual([mine?.mine.member_ref as string]);
  const bRef = currentMembers(db, group.id).find((m) => m.member_id === b.memberId)?.member_ref as string;
  expect(memberPhotoKey(db, group.id, bRef)).toBe(`photos/${b.memberId}.jpg`);
  expect(memberPhotoKey(db, group.id, "0000000000000000")).toBeNull();
  // A removed member's ref stops working, and so does their access.
  withdrawPlan(db, b.planId, "cancelled", NOW);
  expect(memberPhotoKey(db, group.id, bRef)).toBeNull();
  expect(getGroupForMember(db, group.id, b.memberId)).toBeNull();
});

test("a group that was called off or dissolved cannot be opened", () => {
  const db = setup();
  const people = wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  const group = onlyGroup(db);
  withdrawPlan(db, (people[0] as Waiting).planId, "cancelled", NOW);
  expect(getGroup(db, group.id)?.state).toBe("dissolved");
  expect(getGroupForMember(db, group.id, (people[1] as Waiting).memberId)).toBeNull();
});

test("check-in works only in a live group, from T-90m to T+60m, and keeps the first time", () => {
  const db = setup();
  const [a] = wait(db, 4) as [Waiting];
  runGroupingPass(db, "show-a", NOW);
  const group = onlyGroup(db);
  const at = (ms: number) => new Date(START + ms);
  expect(checkIn(db, group.id, a.memberId, at(-80 * 60_000))).toEqual({ ok: false, error: "outside_window" });
  db.query("UPDATE show_group SET state = 'live'").run();
  expect(checkIn(db, group.id, a.memberId, at(-91 * 60_000))).toEqual({ ok: false, error: "outside_window" });
  expect(checkIn(db, group.id, a.memberId, at(-90 * 60_000))).toEqual({ ok: true });
  expect(checkIn(db, group.id, a.memberId, at(-30 * 60_000))).toEqual({ ok: true });
  expect(currentMembers(db, group.id).find((m) => m.member_id === a.memberId)?.checked_in_at).toBe(at(-90 * 60_000).toISOString());
  expect(checkIn(db, group.id, a.memberId, at(60 * 60_000))).toEqual({ ok: false, error: "outside_window" });
  expect(checkIn(db, group.id, seedMember(db, NOW), at(-30 * 60_000))).toEqual({ ok: false, error: "not_found" });
});

test("the cafe can be set while the group is open, and the action is logged without the address", () => {
  const db = setup();
  wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  const group = onlyGroup(db);
  const cafe = { name: "Cafe Test", address: "1 Road", lat: 17.4, lng: 78.4 };
  const set = setCafe(db, group.id, cafe, NOW);
  expect(set.ok && set.group).toMatchObject({ cafe_name: "Cafe Test", cafe_address: "1 Road" });
  expect(setCafe(db, "nope", cafe, NOW)).toEqual({ ok: false, error: "not_found" });
  const logged = db.query("SELECT * FROM operator_action WHERE action = 'set_cafe'").all();
  expect(logged).toHaveLength(1);
  expect(JSON.stringify(logged)).not.toContain("1 Road");
  db.query("UPDATE show_group SET state = 'done'").run();
  expect(setCafe(db, group.id, cafe, NOW)).toEqual({ ok: false, error: "group_closed" });
});

test("a start-time change moves the plans, the groups and the meet time, until a group locks", () => {
  const db = setup();
  const people = wait(db, 4);
  runGroupingPass(db, "show-a", NOW);
  const moved = new Date(START + 2 * HOUR).toISOString();
  expect(setStartTime(db, "show-a", moved, NOW)).toEqual({ ok: true, startsAt: moved });
  expect(getPlan(db, (people[0] as Waiting).planId)?.show_starts_at).toBe(moved);
  expect(onlyGroup(db)).toMatchObject({ starts_at: moved, meet_at: new Date(START + HOUR).toISOString() });
  expect(db.query("SELECT starts_at FROM event WHERE id = 'show-a'").get()).toMatchObject({ starts_at: SHOW_START });
  expect(setStartTime(db, "nope", moved, NOW)).toEqual({ ok: false, error: "not_found" });
  expect(setStartTime(db, "show-a", new Date(NOW.getTime() + 2 * HOUR).toISOString(), NOW)).toEqual({ ok: false, error: "too_late" });
  db.query("UPDATE show_group SET state = 'locked'").run();
  expect(setStartTime(db, "show-a", SHOW_START, NOW)).toEqual({ ok: false, error: "group_locked" });
});
