import type { GroupType } from "@turnout/contract/app/plans";
import { canChooseWomenOnly, type Gender } from "@turnout/contract/profile";
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
  /** Null for a group that does not exist yet. */
  groupId: string | null;
  groupType: GroupType;
  members: { memberId: string; gender: Gender }[];
  /** Most people this slot may hold: six for a group that exists, the planned size for a new one. */
  limit: number;
}

/**
 * Largest group sizes that place the most people: with `n` waiting, the biggest count up to `n` that splits
 * into groups of min to max, spread as evenly as possible with the larger groups first (9 gives 5 and 4,
 * 13 gives 5, 4 and 4, 7 gives a single group of 6).
 */
export function planSizes(n: number, min: number, max: number): number[] {
  for (let placed = n; placed >= min; placed--) {
    const groups = Math.ceil(placed / max);
    if (groups * min > placed) continue;
    const base = Math.floor(placed / groups);
    const extra = placed % groups;
    return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
  }
  return [];
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
 * Put each candidate in the first slot that takes them, and go round again until a pass places nobody
 * (a candidate turned away early can fit once the group has the other gender in it). Returns who is left.
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
      const best = slots.find((slot) => accepts(slot, who, never, t));
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
 * Decide who joins which group for one show. Pure and deterministic: the same pool in any order gives the same answer.
 *
 * Members wait unless their handle is approved. They are taken in approval order, then by id. Groups that already exist and have room are
 * filled first, smallest first. Whoever is left forms new groups of 4 to 6 sized to place the most people. Open groups cap each gender
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
      .sort((a, b) => a.members.length - b.members.length || (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0))
      .map((g) => ({ groupId: g.groupId, groupType, members: [...g.members], limit: t.groupSize.max }));
    const left = fill(existing, candidates, neverPairs, t, (slot, who) => {
      joins.push({ groupId: slot.groupId as string, memberId: who.memberId });
      placedIds.add(who.memberId);
    });
    const fresh: Slot[] = planSizes(left.length, t.groupSize.min, t.groupSize.max).map((limit) => ({
      groupId: null,
      groupType,
      members: [],
      limit,
    }));
    fill(fresh, left, neverPairs, t, () => {});
    for (const slot of fresh) {
      if (slot.members.length < t.groupSize.min) continue;
      const memberIds = slot.members.map((m) => m.memberId).sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));
      created.push({ groupType, memberIds });
      for (const id of memberIds) placedIds.add(id);
    }
  }

  return { joins, created, waiting: ordered.filter((m) => !placedIds.has(m.memberId)).map((m) => m.memberId) };
}
