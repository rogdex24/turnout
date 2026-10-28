import { expect, test } from "bun:test";
import type { GroupType } from "@turnout/contract/app/plans";
import { canChooseWomenOnly, GENDERS, type Gender } from "@turnout/contract/profile";
import { assign, type ExistingGroup, neverPairSet, type PoolMember, pairKey } from "../src/social/model/grouping.js";
import { DEFAULT_TUNABLES } from "../src/social/model/tunables.js";

const T = DEFAULT_TUNABLES;
const { min, max } = T.groupSize;

/** A small seeded generator, so a failing case can be rerun from its number. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Case {
  pool: PoolMember[];
  groups: ExistingGroup[];
  never: [string, string][];
}

function makeCase(seed: number): Case {
  const next = rng(seed);
  const pick = <V>(items: readonly V[]): V => items[Math.floor(next() * items.length)] as V;
  const size = Math.floor(next() * 41);
  const pool: PoolMember[] = Array.from({ length: size }, (_, i) => ({
    memberId: `p${String(i).padStart(2, "0")}`,
    gender: pick(GENDERS),
    groupType: next() < 0.3 ? "women_only" : "open",
    approvedAt: next() < 0.15 ? null : `2026-11-01T10:${String(Math.floor(next() * 12)).padStart(2, "0")}:00.000Z`,
  }));
  const groups: ExistingGroup[] = [];
  let taken = 0;
  for (let g = 0; g < Math.floor(next() * 4); g++) {
    const groupType: GroupType = next() < 0.3 ? "women_only" : "open";
    const count = min + Math.floor(next() * (max - min + 1));
    const members: ExistingGroup["members"] = [];
    for (let i = 0; i < count; i++) {
      // Open groups made inside the caps: no gender more than the cap for its size.
      let gender: Gender = groupType === "women_only" ? pick(["woman", "non_binary"] as const) : pick(GENDERS);
      if (groupType === "open" && members.filter((m) => m.gender === gender).length >= (T.genderCaps[Math.max(count, min)] ?? count)) {
        gender = GENDERS.find((x) => members.filter((m) => m.gender === x).length < 2) as Gender;
      }
      members.push({ memberId: `e${taken++}`, gender });
    }
    groups.push({ groupId: `g${g}`, groupType, members });
  }
  const everyone = [...pool.map((m) => m.memberId), ...groups.flatMap((g) => g.members.map((m) => m.memberId))];
  const inside = new Set(groups.flatMap((g) => g.members.flatMap((a) => g.members.map((b) => pairKey(a.memberId, b.memberId)))));
  const never: [string, string][] = [];
  const pairs = Math.floor(next() * 25);
  for (let i = 0; i < pairs; i++) {
    const a = pick(everyone);
    const b = pick(everyone);
    if (a !== b && !inside.has(pairKey(a, b))) never.push([a, b]);
  }
  return { pool, groups, never };
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

test("every invariant holds over 300 seeded pools of up to 40", () => {
  let newGroups = 0;
  let joined = 0;
  for (const seed of SEEDS) {
    const { pool, groups, never } = makeCase(seed);
    const neverSet = neverPairSet(never);
    const result = assign(pool, groups, neverSet, T);
    const byId = new Map(pool.map((m) => [m.memberId, m]));
    const label = `seed ${seed}`;
    newGroups += result.created.length;
    joined += result.joins.length;

    // Everyone in the pool is placed once or waits once.
    const placed = [...result.joins.map((j) => j.memberId), ...result.created.flatMap((g) => g.memberIds)];
    expect(new Set(placed).size, label).toBe(placed.length);
    expect([...placed, ...result.waiting].sort(), label).toEqual(pool.map((m) => m.memberId).sort());

    // Only matchable members are placed: an approved handle, and a woman or non-binary person for a women-only group.
    for (const id of placed) {
      const m = byId.get(id) as PoolMember;
      expect(m.approvedAt, label).not.toBeNull();
      if (m.groupType === "women_only") expect(canChooseWomenOnly(m.gender), label).toBe(true);
    }

    // The final groups: existing ones plus joins, and the new ones.
    const finals: { groupType: GroupType; members: { memberId: string; gender: Gender }[]; isNew: boolean }[] = [
      ...groups.map((g) => ({
        groupType: g.groupType,
        isNew: false,
        members: [
          ...g.members,
          ...result.joins
            .filter((j) => j.groupId === g.groupId)
            .map((j) => ({ memberId: j.memberId, gender: (byId.get(j.memberId) as PoolMember).gender })),
        ],
      })),
      ...result.created.map((g) => ({
        groupType: g.groupType,
        isNew: true,
        members: g.memberIds.map((id) => ({ memberId: id, gender: (byId.get(id) as PoolMember).gender })),
      })),
    ];
    for (const g of finals) {
      // Sizes: new groups 4 to 6; a joined group never goes over 6.
      expect(g.members.length, label).toBeLessThanOrEqual(max);
      if (g.isNew) expect(g.members.length, label).toBeGreaterThanOrEqual(min);
      // No type mixing.
      for (const m of g.members) {
        const source = byId.get(m.memberId);
        if (source) expect(source.groupType, label).toBe(g.groupType);
      }
      // Caps in open groups.
      if (g.groupType === "open") {
        for (const gender of GENDERS) {
          const count = g.members.filter((m) => m.gender === gender).length;
          expect(count, label).toBeLessThanOrEqual(T.genderCaps[Math.max(g.members.length, min)] ?? max);
        }
      }
      // Never-pairs.
      for (const a of g.members)
        for (const b of g.members) if (a.memberId < b.memberId) expect(neverSet.has(pairKey(a.memberId, b.memberId)), label).toBe(false);
    }
    // A joined existing group stays inside the caps only if it was inside them before, so the invariant above is on the result.
    expect(
      result.created.every((g) => g.memberIds.length >= min),
      label,
    ).toBe(true);
  }
  // The cases are not all empty: groups are formed and joined.
  expect(newGroups).toBeGreaterThan(100);
  expect(joined).toBeGreaterThan(50);
});

test("the same pool in a different order gives the same answer", () => {
  for (const seed of SEEDS.slice(0, 100)) {
    const { pool, groups, never } = makeCase(seed);
    const shuffle = rng(seed * 7);
    const shuffled = [...pool].sort(() => shuffle() - 0.5);
    const reversedGroups = [...groups].reverse().map((g) => ({ ...g, members: [...g.members].reverse() }));
    const set = neverPairSet(never);
    expect(assign(shuffled, reversedGroups, set, T), `seed ${seed}`).toEqual(assign(pool, groups, set, T));
  }
});

test("with no caps in the way and no never-pairs, everyone who can be placed is", () => {
  for (let n = 0; n <= 40; n++) {
    const pool: PoolMember[] = Array.from({ length: n }, (_, i) => ({
      memberId: `w${String(i).padStart(2, "0")}`,
      gender: "woman",
      groupType: "women_only",
      approvedAt: `2026-11-01T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
    }));
    const result = assign(pool, [], new Set(), T);
    const placed = result.created.reduce((total, g) => total + g.memberIds.length, 0);
    // Seven is the one count that cannot be split into groups of 4 to 6, and 1 to 3 cannot form a group.
    const expected = n < min ? 0 : n === 7 ? 6 : n;
    expect(placed, `n=${n}`).toBe(expected);
  }
});

test("a pool of 40 is the same on every run", () => {
  const { pool, groups, never } = makeCase(40);
  const set = neverPairSet(never);
  expect(JSON.stringify(assign(pool, groups, set, T))).toBe(JSON.stringify(assign(pool, groups, set, T)));
});
