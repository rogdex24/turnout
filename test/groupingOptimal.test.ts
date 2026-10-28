import { expect, test } from "bun:test";
import { GENDERS, type Gender } from "@turnout/contract/profile";
import { assign, type PoolMember } from "../src/social/model/grouping.js";
import { DEFAULT_TUNABLES as T } from "../src/social/model/tunables.js";

const { min, max } = T.groupSize;

/**
 * The most people any set of open groups can hold, by trying every group that fits the caps. It works on counts per gender and knows
 * nothing about the order of arrival, so it is an independent check of what `assign` places.
 */
function bestPlaced(counts: number[]): number {
  const memo = new Map<string, number>();
  const go = (have: number[]): number => {
    const key = have.join(",");
    const known = memo.get(key);
    if (known !== undefined) return known;
    let best = 0;
    for (let size = min; size <= max; size++) {
      const cap = T.genderCaps[Math.max(size, min)] ?? size;
      for (let a = Math.min(cap, have[0] as number); a >= 0; a--)
        for (let b = Math.min(cap, have[1] as number, size - a); b >= 0; b--) {
          const c = size - a - b;
          if (c < 0 || c > cap || c > (have[2] as number)) continue;
          best = Math.max(best, size + go([(have[0] as number) - a, (have[1] as number) - b, (have[2] as number) - c]));
        }
    }
    memo.set(key, best);
    return best;
  };
  return go(counts);
}

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

test("on open pools of up to 14, assign places as many people as any grouping could, in any order of arrival", () => {
  for (let seed = 1; seed <= 400; seed++) {
    const next = rng(seed);
    const size = Math.floor(next() * 15);
    // A skewed mix on most seeds, so the caps are the thing that decides.
    const lean = Math.floor(next() * GENDERS.length);
    const pool: PoolMember[] = Array.from({ length: size }, (_, i) => ({
      memberId: `p${String(i).padStart(2, "0")}`,
      gender: (next() < 0.6 ? GENDERS[lean] : GENDERS[Math.floor(next() * GENDERS.length)]) as Gender,
      groupType: "open",
      approvedAt: `2026-11-01T10:${String(Math.floor(next() * 50)).padStart(2, "0")}:00.000Z`,
    }));
    const counts = GENDERS.map((g) => pool.filter((m) => m.gender === g).length);
    const result = assign(pool, [], new Set(), T);
    const got = result.created.reduce((n, g) => n + g.memberIds.length, 0);
    expect(got, `seed ${seed} counts ${counts.join("/")}`).toBe(bestPlaced(counts));
    // Every new group is inside the size range and the caps.
    const byId = new Map(pool.map((m) => [m.memberId, m]));
    for (const g of result.created) {
      expect(g.memberIds.length).toBeGreaterThanOrEqual(min);
      expect(g.memberIds.length).toBeLessThanOrEqual(max);
      for (const gender of GENDERS) {
        const n = g.memberIds.filter((id) => byId.get(id)?.gender === gender).length;
        expect(n, `seed ${seed}`).toBeLessThanOrEqual(T.genderCaps[Math.max(g.memberIds.length, min)] ?? max);
      }
    }
    expect(result.waiting.length + got, `seed ${seed}`).toBe(size);
  }
});

test("when the caps leave a choice, the people who were approved first are the ones placed", () => {
  const genders = ["woman", "woman", "woman", "man", "woman", "woman", "woman", "woman"] as const;
  const pool: PoolMember[] = genders.map((gender, i) => ({
    memberId: `p${i}`,
    gender,
    groupType: "open",
    approvedAt: `2026-11-01T10:0${i}:00.000Z`,
  }));
  const result = assign(pool, [], new Set(), T);
  // One man lets only one group of four stand (three women and him): the three earliest women, not the later ones.
  expect(result.created).toEqual([{ groupType: "open", memberIds: ["p0", "p1", "p2", "p3"] }]);
  expect(result.waiting).toEqual(["p4", "p5", "p6", "p7"]);
});
