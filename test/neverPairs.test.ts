import { describe, expect, test } from "bun:test";
import type { Gender } from "@turnout/contract/profile";
import { assign, neverPairSet, type PoolMember } from "../src/social/model/grouping.js";
import { tunables } from "../src/social/model/tunables.js";
import { neverPairsAmong } from "../src/social/neverPairs.js";
import { tick } from "../src/social/tick.js";
import { testApp } from "./appHelpers.js";
import { pastGroup } from "./helpers/pastGroup.js";
import { seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";

async function world(people: number) {
  const t = await testApp();
  const ids = Array.from({ length: people }, (_, i) =>
    seedMember(t.db, t.clock(), { phoneIndex: i, name: `Person${i}`, gender: i % 2 === 0 ? "woman" : "man" }),
  );
  return { t, ids };
}
const mark = (db: import("bun:sqlite").Database, kind: "downvote" | "report", groupId: string, a: string, b: string) => {
  if (kind === "downvote") {
    db.query("INSERT INTO downvote (id, group_id, voter_id, target_id, created_at) VALUES (?, ?, ?, ?, '2026-09-02T00:00:00.000Z')").run(
      `dv-${a}-${b}`,
      groupId,
      a,
      b,
    );
    return;
  }
  db.query(
    `INSERT INTO report (id, group_id, reporter_id, subject_id, body, client_id, subject_status_before, created_at, due_at)
     VALUES (?, ?, ?, ?, 'b', ?, 'active', '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z')`,
  ).run(`rp-${a}-${b}`, groupId, a, b, `c-${a}-${b}`);
};
const groupsOf = (db: import("bun:sqlite").Database) =>
  (
    db
      .query(
        "SELECT gm.group_id, gm.member_id FROM group_member gm JOIN show_group g ON g.id = gm.group_id WHERE gm.left_at IS NULL AND g.event_id = 'show-a'",
      )
      .all() as { group_id: string; member_id: string }[]
  ).reduce((acc, r) => acc.set(r.group_id, [...(acc.get(r.group_id) ?? []), r.member_id]), new Map<string, string[]>());

describe("never pairs", () => {
  test("every downvote and every report is a pair, in either direction, and only among the people asked about", async () => {
    const { t, ids } = await world(5);
    const past = pastGroup(t.db, { startsAt: "2026-09-01T14:00:00.000Z", memberIds: ids });
    mark(t.db, "downvote", past.groupId, ids[0] as string, ids[1] as string);
    mark(t.db, "report", past.groupId, ids[2] as string, ids[3] as string);
    const pairs = neverPairsAmong(t.db, ids).map(([a, b]) => [a, b].sort().join(":"));
    expect(pairs.sort()).toEqual([[ids[0], ids[1]].sort().join(":"), [ids[2], ids[3]].sort().join(":")].sort());
    expect(neverPairsAmong(t.db, [ids[0] as string, ids[2] as string, ids[4] as string])).toEqual([]);
    expect(neverPairsAmong(t.db, [ids[0] as string])).toEqual([]);
  });

  test("two people with a downvote between them are not put in a group together, and four with one such pair are not grouped at all", async () => {
    const { t, ids } = await world(4);
    const past = pastGroup(t.db, { startsAt: "2026-09-01T14:00:00.000Z", memberIds: ids });
    mark(t.db, "downvote", past.groupId, ids[0] as string, ids[1] as string);
    seedShow(t.db, { id: "show-a" });
    for (const id of ids) waitingPlan(t.db, id, "show-a", t.clock());
    tick(t.db, t.clock());
    expect(groupsOf(t.db).size).toBe(0);
  });

  test("a report keeps its pair apart when there are enough people to make two groups", async () => {
    const { t, ids } = await world(8);
    const past = pastGroup(t.db, { startsAt: "2026-09-01T14:00:00.000Z", memberIds: ids.slice(0, 2) });
    mark(t.db, "report", past.groupId, ids[0] as string, ids[1] as string);
    seedShow(t.db, { id: "show-a" });
    for (const id of ids) waitingPlan(t.db, id, "show-a", t.clock());
    tick(t.db, t.clock());
    const groups = [...groupsOf(t.db).values()];
    expect(groups.length).toBeGreaterThan(0);
    for (const members of groups) expect(members.includes(ids[0] as string) && members.includes(ids[1] as string)).toBe(false);
  });
});

const GENDER_OF: Record<string, Gender> = { w: "woman", m: "man" };
const people = (genders: string): PoolMember[] =>
  [...genders].map((g, i) => ({
    memberId: `m${String(i + 1).padStart(2, "0")}`,
    gender: GENDER_OF[g] as Gender,
    groupType: "open",
    approvedAt: `2026-11-01T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
  }));

describe("a never-pair does not stall a group", () => {
  test("five people approved in order with m01 and m02 never paired make a group of the other four", () => {
    const a = assign(people("wmwmw"), [], neverPairSet([["m01", "m02"]]), tunables());
    expect(a.created).toHaveLength(1);
    expect(a.created[0]?.memberIds.length).toBe(4);
    expect(a.created[0]?.memberIds.includes("m01") && a.created[0]?.memberIds.includes("m02")).toBe(false);
    expect(a.waiting).toHaveLength(1);
  });

  test("the earliest approved are still taken first when nothing clashes", () => {
    const a = assign(people("wmwmw"), [], neverPairSet([["m04", "m05"]]), tunables());
    expect(a.created[0]?.memberIds).toEqual(["m01", "m02", "m03", "m04"]);
  });

  test("80 people with dense never-pairs are answered within the step cap", () => {
    const pool = people("wm".repeat(40));
    const pairs: [string, string][] = [];
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < Math.min(pool.length, i + 25); j++)
        pairs.push([(pool[i] as PoolMember).memberId, (pool[j] as PoolMember).memberId]);
    const started = performance.now();
    const a = assign(pool, [], neverPairSet(pairs), tunables());
    expect(performance.now() - started).toBeLessThan(3000);
    const never = neverPairSet(pairs);
    for (const g of a.created)
      for (const x of g.memberIds) for (const y of g.memberIds) expect(never.has(x < y ? `${x}|${y}` : `${y}|${x}`)).toBe(false);
  });
});
