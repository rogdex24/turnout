import type { GroupType } from "@turnout/contract/app/plans";
import { canChooseWomenOnly, GENDERS, type Gender } from "@turnout/contract/profile";
import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

/** A member whose plan is in `finding_group` for this show. */
export interface PoolMember {
  memberId: string;
  gender: Gender;
  groupType: GroupType;
  /** When the operator approved their handle. Null means it is not approved: the member waits. */
  approvedAt: string | null;
}

/** A confirmed group for this show that still has room. The caller leaves out groups that are locked, dissolved or full of people who left. */
export interface ExistingGroup {
  groupId: string;
  groupType: GroupType;
  members: { memberId: string; gender: Gender }[];
}

export interface Assignment {
  /** People added to a group that already exists. */
  joins: { groupId: string; memberId: string }[];
  /** New groups, members in the pool's order. */
  created: { groupType: GroupType; memberIds: string[] }[];
  /** Everyone in the pool who was not placed, in the pool's order. */
  waiting: string[];
}

/** The key a never-pair set holds for two members, in either order. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function neverPairSet(pairs: readonly (readonly [string, string])[]): Set<string> {
  return new Set(pairs.map(([a, b]) => pairKey(a, b)));
}

interface Slot {
  groupId: string;
  groupType: GroupType;
  members: { memberId: string; gender: Gender }[];
  /** Most people this slot may hold. */
  limit: number;
}

/** The most of one gender a group of this size may hold. Sizes under the minimum use the minimum's cap. */
function genderCap(size: number, t: Tunables): number {
  return t.genderCaps[Math.max(size, t.groupSize.min)] ?? Number.POSITIVE_INFINITY;
}

function accepts(slot: Slot, who: PoolMember, never: ReadonlySet<string>, t: Tunables): boolean {
  if (slot.members.length >= slot.limit) return false;
  if (slot.members.some((m) => never.has(pairKey(m.memberId, who.memberId)))) return false;
  if (slot.groupType === "women_only") return true;
  const size = slot.members.length + 1;
  const counts = new Map<Gender, number>([[who.gender, 1]]);
  for (const m of slot.members) counts.set(m.gender, (counts.get(m.gender) ?? 0) + 1);
  const cap = genderCap(size, t);
  return [...counts.values()].every((count) => count <= cap);
}

/**
 * Put each candidate in the smallest slot that takes them (the lowest index on a tie), and go round again until a pass
 * places nobody (a candidate turned away early can fit once the group has the other gender in it). Returns who is left.
 */
function fill(
  slots: Slot[],
  candidates: PoolMember[],
  never: ReadonlySet<string>,
  t: Tunables,
  onJoin: (slot: Slot, who: PoolMember) => void,
): PoolMember[] {
  let remaining = candidates;
  for (;;) {
    let progress = false;
    const next: PoolMember[] = [];
    for (const who of remaining) {
      let best: Slot | undefined;
      for (const slot of slots) {
        if (accepts(slot, who, never, t) && (best === undefined || slot.members.length < best.members.length)) best = slot;
      }
      if (best === undefined) {
        next.push(who);
        continue;
      }
      best.members.push({ memberId: who.memberId, gender: who.gender });
      onJoin(best, who);
      progress = true;
    }
    remaining = next;
    if (!progress || remaining.length === 0) return remaining;
  }
}

/**
 * Every way to split `total` people into groups of min to max, best first: fewest groups, then the most even, then the
 * larger groups first (9 gives 5 and 4, 13 gives 5, 4 and 4).
 */
function splitsOf(total: number, min: number, max: number): number[][] {
  const found: number[][] = [];
  const walk = (left: number, cap: number, soFar: number[]): void => {
    if (left === 0) {
      found.push(soFar);
      return;
    }
    for (let size = Math.min(cap, left); size >= min; size--) walk(left - size, size, [...soFar, size]);
  };
  walk(total, max, []);
  const spread = (s: number[]) => (s[0] as number) - (s[s.length - 1] as number);
  const lex = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (b[i] as number) - (a[i] as number);
    return 0;
  };
  return found.sort((a, b) => a.length - b.length || spread(a) - spread(b) || lex(a, b));
}

/**
 * How many of each gender go in each slot, or null when the people cannot fill the slots within the caps. A small
 * max-flow: genders on one side, slots on the other, a gender-slot edge holds at most the slot's cap.
 */
function quotas(counts: number[], sizes: number[], caps: number[]): number[][] | null {
  const g = counts.length;
  const s = sizes.length;
  const flow = counts.map(() => sizes.map(() => 0));
  const gLeft = [...counts];
  const sLeft = [...sizes];
  // Augment along gender -> slot -> (other gender) -> slot chains until nothing moves.
  for (;;) {
    // Breadth first from the genders that still have people, over nodes: genders 0..g-1, slots g..g+s-1.
    const from = new Array<number>(g + s).fill(-2);
    const queue: number[] = [];
    for (let i = 0; i < g; i++) {
      if ((gLeft[i] as number) > 0) {
        from[i] = -1;
        queue.push(i);
      }
    }
    let end = -1;
    for (let head = 0; head < queue.length && end < 0; head++) {
      const node = queue[head] as number;
      if (node < g) {
        for (let j = 0; j < s; j++) {
          if (from[g + j] === -2 && (flow[node] as number[])[j]! < (caps[j] as number)) {
            from[g + j] = node;
            queue.push(g + j);
            if ((sLeft[j] as number) > 0) {
              end = g + j;
              break;
            }
          }
        }
      } else {
        const j = node - g;
        for (let i = 0; i < g; i++) {
          if (from[i] === -2 && (flow[i] as number[])[j]! > 0) {
            from[i] = node;
            queue.push(i);
          }
        }
      }
    }
    if (end < 0) break;
    let node = end;
    while (from[node] !== -1) {
      const prev = from[node] as number;
      if (node >= g) (flow[prev] as number[])[node - g]!++;
      else (flow[node] as number[])[prev - g]!--;
      node = prev;
    }
    gLeft[node]!--;
    sLeft[end - g]!--;
  }
  return gLeft.every((n) => n === 0) && sLeft.every((n) => n === 0) ? flow : null;
}

/** Spread the chosen people over the slots by their quotas, keeping never-pairs apart. Null when no way is found. */
function place(chosen: PoolMember[], quota: number[][], never: ReadonlySet<string>): PoolMember[][] | null {
  const slots = quota[0]!.map((): PoolMember[] => []);
  const left = quota.map((row) => [...row]);
  let budget = 20000;
  const go = (at: number): boolean => {
    if (at === chosen.length) return true;
    if (budget-- <= 0) return false;
    const who = chosen[at] as PoolMember;
    const gi = GENDERS.indexOf(who.gender);
    // The slot with the most room left first, so the groups fill evenly.
    const order = slots.map((_, i) => i).sort((a, b) => (left[gi] as number[])[b]! - (left[gi] as number[])[a]! || a - b);
    for (const i of order) {
      if ((left[gi] as number[])[i]! <= 0) continue;
      if ((slots[i] as PoolMember[]).some((m) => never.has(pairKey(m.memberId, who.memberId)))) continue;
      (slots[i] as PoolMember[]).push(who);
      (left[gi] as number[])[i]!--;
      if (go(at + 1)) return true;
      (left[gi] as number[])[i]!++;
      (slots[i] as PoolMember[]).pop();
    }
    return false;
  };
  return go(0) ? slots : null;
}

/**
 * New groups from `left` (in approval order) that place the most people. Tries every split into groups of min to max,
 * the largest total first, and keeps the first one the caps allow: a group's gender cap depends on its final size, so
 * the sizes cannot be picked without looking at who is waiting. For a split, a person is taken (earliest approved first)
 * only if the chosen people can still fill the slots, which is Hall's condition per set of genders; the chosen people
 * are then dealt out by a max-flow of genders to slots.
 */
function newGroups(left: PoolMember[], groupType: GroupType, never: ReadonlySet<string>, t: Tunables): PoolMember[][] {
  const { min, max } = t.groupSize;
  for (let total = left.length; total >= min; total--) {
    for (const sizes of splitsOf(total, min, max)) {
      const caps = sizes.map((size) => (groupType === "women_only" ? Number.POSITIVE_INFINITY : genderCap(size, t)));
      const subsets = Array.from({ length: 1 << GENDERS.length }, (_, mask) => ({
        mask,
        room: sizes.reduce((sum, size, i) => sum + Math.min(size, popcount(mask) * (caps[i] as number)), 0),
      })).filter((x) => x.mask > 0);
      const taken = GENDERS.map(() => 0);
      const chosen: PoolMember[] = [];
      for (const who of left) {
        if (chosen.length === total) break;
        const gi = GENDERS.indexOf(who.gender);
        taken[gi]!++;
        const fits = subsets.every(({ mask, room }) => taken.reduce((sum, n, i) => sum + (mask & (1 << i) ? n : 0), 0) <= room);
        if (fits) chosen.push(who);
        else taken[gi]!--;
      }
      if (chosen.length < total) continue;
      const quota = quotas(taken, sizes, caps);
      if (quota === null) continue;
      const slots = place(chosen, quota, never);
      if (slots !== null) return slots;
    }
  }
  return [];
}

function popcount(n: number): number {
  let c = 0;
  for (let x = n; x > 0; x >>= 1) c += x & 1;
  return c;
}

/**
 * Decide who joins which group for one show. Pure and deterministic: the same pool in any order gives the same answer.
 *
 * Members wait unless their handle is approved. They are taken in approval order, then by id. Groups that already exist and have room are
 * filled first, each person going to the smallest group at that moment. Whoever is left forms new groups of 4 to 6 sized to place the most people. Open groups cap each gender
 * (`genderCaps`); women-only groups do not and take no man. Open and women-only members never meet. A never-pair never shares a group, including with
 * someone already in it. Nobody forms a group below the minimum.
 */
export function assign(
  pool: readonly PoolMember[],
  groups: readonly ExistingGroup[],
  neverPairs: ReadonlySet<string>,
  t: Tunables = DEFAULT_TUNABLES,
): Assignment {
  const ordered = [...pool].sort(
    (a, b) => (a.approvedAt ?? "~").localeCompare(b.approvedAt ?? "~") || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
  );
  const rank = new Map(ordered.map((m, i) => [m.memberId, i]));
  const joins: Assignment["joins"] = [];
  const created: Assignment["created"] = [];
  const placedIds = new Set<string>();

  for (const groupType of ["open", "women_only"] as const) {
    const candidates = ordered.filter(
      (m) => m.groupType === groupType && m.approvedAt !== null && (groupType === "open" || canChooseWomenOnly(m.gender)),
    );
    const existing: Slot[] = groups
      .filter((g) => g.groupType === groupType)
      .sort((a, b) => (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0))
      .map((g) => ({ groupId: g.groupId, groupType, members: [...g.members], limit: t.groupSize.max }));
    const left = fill(existing, candidates, neverPairs, t, (slot, who) => {
      joins.push({ groupId: slot.groupId, memberId: who.memberId });
      placedIds.add(who.memberId);
    });
    for (const members of newGroups(left, groupType, neverPairs, t)) {
      const memberIds = members.map((m) => m.memberId).sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));
      created.push({ groupType, memberIds });
      for (const id of memberIds) placedIds.add(id);
    }
  }

  return { joins, created, waiting: ordered.filter((m) => !placedIds.has(m.memberId)).map((m) => m.memberId) };
}
