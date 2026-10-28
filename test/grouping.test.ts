import { describe, expect, test } from "bun:test";
import type { Gender } from "@turnout/contract/profile";
import { type Assignment, assign, type ExistingGroup, neverPairSet, type PoolMember } from "../src/social/model/grouping.js";
import { tunables } from "../src/social/model/tunables.js";

const T = tunables();
const STAMP = (n: number) => `2026-11-01T10:${String(n % 60).padStart(2, "0")}:00.000Z`;

/** Members `m01`, `m02` ... approved in order, with the genders given as a string: `w` woman, `m` man, `n` non-binary. */
function pool(genders: string, groupType: "open" | "women_only" = "open", from = 1): PoolMember[] {
  return [...genders].map((g, i) => ({
    memberId: `m${String(from + i).padStart(2, "0")}`,
    gender: ({ w: "woman", m: "man", n: "non_binary" } as Record<string, Gender>)[g] as Gender,
    groupType,
    approvedAt: STAMP(from + i),
  }));
}

const sizes = (a: Assignment) => a.created.map((g) => g.memberIds.length);
const placed = (a: Assignment) => a.created.reduce((n, g) => n + g.memberIds.length, 0) + a.joins.length;
const NONE = new Set<string>();

describe("new groups", () => {
  test("nobody forms a group below four", () => {
    const a = assign(pool("wmw"), [], NONE, T);
    expect(a.created).toEqual([]);
    expect(a.waiting).toEqual(["m01", "m02", "m03"]);
  });

  test("the sizes place the most people: 4, 5, 6, 8, 9, 10, 11, 12, 13", () => {
    const want: [number, number[]][] = [
      [4, [4]],
      [5, [5]],
      [6, [6]],
      [7, [6]],
      [8, [4, 4]],
      [9, [5, 4]],
      [10, [5, 5]],
      [11, [6, 5]],
      [12, [6, 6]],
      [13, [5, 4, 4]],
    ];
    for (const [n, expected] of want) {
      // Alternate the genders so no cap interferes.
      const a = assign(pool("wm".repeat(10).slice(0, n)), [], NONE, T);
      expect(sizes(a)).toEqual(expected);
      expect(a.waiting).toHaveLength(n - expected.reduce((x, y) => x + y, 0));
    }
  });

  test("nine mixed people make a group of five and a group of four", () => {
    const a = assign(pool("wmwmwmwmw"), [], NONE, T);
    expect(sizes(a)).toEqual([5, 4]);
  });

  test("the earliest approved are placed first and the last one waits when the pool is seven", () => {
    const a = assign(pool("wmwmwmw"), [], NONE, T);
    expect(a.waiting).toEqual(["m07"]);
  });

  test("a member whose handle is not approved waits, whatever their place in the line", () => {
    const members = pool("wmwmw");
    (members[0] as PoolMember).approvedAt = null;
    const a = assign(members, [], NONE, T);
    expect(a.created).toEqual([{ groupType: "open", memberIds: ["m02", "m03", "m04", "m05"] }]);
    expect(a.waiting).toEqual(["m01"]);
  });

  test("the order is the approval time, then the member id, not the order of the list", () => {
    const members = pool("wmwmwmw");
    const reversed = [...members].reverse();
    expect(assign(reversed, [], NONE, T)).toEqual(assign(members, [], NONE, T));
    const tie = members.map((m) => ({ ...m, approvedAt: STAMP(1) }));
    expect(assign(tie, [], NONE, T).waiting).toEqual(["m07"]);
  });
});

describe("gender caps in open groups", () => {
  test("four of one gender cannot make a group of four", () => {
    expect(assign(pool("wwww"), [], NONE, T).created).toEqual([]);
  });

  test("three and one can", () => {
    expect(sizes(assign(pool("wwwm"), [], NONE, T))).toEqual([4]);
  });

  test("six allows four of one gender, five does not", () => {
    expect(sizes(assign(pool("wwwwmm"), [], NONE, T))).toEqual([6]);
    const five = assign(pool("wwwwm"), [], NONE, T);
    expect(sizes(five)).toEqual([4]);
    expect(five.waiting).toHaveLength(1);
  });

  test("a group of nine women and one man places the four it can", () => {
    const a = assign(pool("wwwwwwwwwm"), [], NONE, T);
    expect(sizes(a)).toEqual([4]);
    expect(placed(a)).toBe(4);
  });

  test("sizes are chosen with the caps in mind: nine women and three men make three groups of four", () => {
    const a = assign(pool("wwwwwwwwwmmm"), [], NONE, T);
    expect(sizes(a)).toEqual([4, 4, 4]);
    expect(placed(a)).toBe(12);
    expect(a.waiting).toEqual([]);
  });

  test("eight women and two men place eight, ten women and four men place fourteen", () => {
    expect(placed(assign(pool("wwwwwwwwmm"), [], NONE, T))).toBe(8);
    const big = assign(pool("wwwwwwwwwwmmmm"), [], NONE, T);
    expect(placed(big)).toBe(14);
    expect(big.waiting).toEqual([]);
  });

  test("the order of arrival does not stop a mixed pool from filling: two men first, then six women", () => {
    const a = assign(pool("mmwwwwww"), [], NONE, T);
    expect(sizes(a)).toEqual([4, 4]);
  });

  test("a group of six may hold four of one gender, and the sizes use that", () => {
    // Four women and two men fit one group of six (cap 4); the same eight as two groups of four would need 3 women at most each.
    const a = assign(pool("wwwwmm"), [], NONE, T);
    expect(sizes(a)).toEqual([6]);
  });

  test("non-binary is a category of its own", () => {
    expect(sizes(assign(pool("nnnm"), [], NONE, T))).toEqual([4]);
    expect(assign(pool("nnnn"), [], NONE, T).created).toEqual([]);
  });

  test("women-only groups have no cap", () => {
    expect(sizes(assign(pool("wwwwww", "women_only"), [], NONE, T))).toEqual([6]);
  });
});

describe("open and women-only", () => {
  test("never mix, each type forms its own groups", () => {
    const members = [...pool("wmwm", "open"), ...pool("wnwn", "women_only", 5)];
    const a = assign(members, [], NONE, T);
    expect(a.created.map((g) => [g.groupType, g.memberIds])).toEqual([
      ["open", ["m01", "m02", "m03", "m04"]],
      ["women_only", ["m05", "m06", "m07", "m08"]],
    ]);
  });

  test("a women-only member who is a man is left waiting", () => {
    const a = assign(pool("wwwm", "women_only"), [], NONE, T);
    expect(a.created).toEqual([]);
    expect(a.waiting).toContain("m04");
  });

  test("an open member never joins a women-only group, nor the other way round", () => {
    const groups: ExistingGroup[] = [
      {
        groupId: "g1",
        groupType: "women_only",
        members: pool("wwww", "women_only", 20).map((m) => ({ memberId: m.memberId, gender: m.gender })),
      },
    ];
    const a = assign(pool("wm", "open"), groups, NONE, T);
    expect(a.joins).toEqual([]);
    expect(a.waiting).toEqual(["m01", "m02"]);
  });
});

describe("existing groups", () => {
  const ids = (members: PoolMember[]) => members.map((m) => ({ memberId: m.memberId, gender: m.gender }));
  const group = (groupId: string, genders: string, from: number, groupType: "open" | "women_only" = "open"): ExistingGroup => ({
    groupId,
    groupType,
    members: ids(pool(genders, groupType, from)),
  });

  test("a group below six fills first, and the rest go on to form a new one", () => {
    const a = assign(pool("wmwmwmw", "open", 10), [group("g1", "wmwm", 1)], NONE, T);
    expect(a.joins.map((j) => j.groupId)).toEqual(["g1", "g1"]);
    expect(a.joins.map((j) => j.memberId)).toEqual(["m10", "m11"]);
    // Five are left, and they make a group of five.
    expect(sizes(a)).toEqual([5]);
    expect(a.waiting).toEqual([]);
  });

  test("three left over after filling wait", () => {
    const a = assign(pool("wmw", "open", 10), [group("g1", "wmwm", 1)], NONE, T);
    expect(a.joins).toHaveLength(2);
    expect(a.created).toEqual([]);
    expect(a.waiting).toEqual(["m12"]);
  });

  test("a full group takes nobody", () => {
    const a = assign(pool("wm", "open", 10), [group("g1", "wmwmwm", 1)], NONE, T);
    expect(a.joins).toEqual([]);
  });

  test("the smaller group fills first", () => {
    const a = assign(pool("m", "open", 10), [group("g1", "wmwmw", 1), group("g2", "wmwm", 20)], NONE, T);
    expect(a.joins).toEqual([{ groupId: "g2", memberId: "m10" }]);
  });

  test("each person goes to the smallest group at that moment, not the one that was smallest at the start", () => {
    const a = assign(pool("mm", "open", 10), [group("g1", "wmwmw", 1), group("g2", "wmwm", 20)], NONE, T);
    expect(a.joins).toEqual([
      { groupId: "g2", memberId: "m10" },
      { groupId: "g1", memberId: "m11" },
    ]);
  });

  test("the caps count the people already in the group", () => {
    // Three women and a man: a fourth woman would make five with four women, so she waits for a man to come first.
    const alone = assign(pool("w", "open", 10), [group("g1", "wwwm", 1)], NONE, T);
    expect(alone.joins).toEqual([]);
    expect(alone.waiting).toEqual(["m10"]);
    // With a man ahead of her, six with four women is inside the cap.
    const both = assign(pool("wm", "open", 10), [group("g1", "wwwm", 1)], NONE, T);
    expect(both.joins).toEqual([
      { groupId: "g1", memberId: "m11" },
      { groupId: "g1", memberId: "m10" },
    ]);
  });
});

describe("never-pairs", () => {
  test("two people who are never paired do not share a group", () => {
    const never = neverPairSet([["m01", "m02"]]);
    const a = assign(pool("wmwmwmwm"), [], never, T);
    for (const g of a.created) expect(g.memberIds.includes("m01") && g.memberIds.includes("m02")).toBe(false);
    expect(sizes(a)).toEqual([4, 4]);
  });

  test("a never-pair with someone already in the group keeps the newcomer out of it", () => {
    const existing: ExistingGroup = {
      groupId: "g1",
      groupType: "open",
      members: pool("wmwm", "open", 1).map((m) => ({ memberId: m.memberId, gender: m.gender })),
    };
    const a = assign(pool("w", "open", 10), [existing], neverPairSet([["m02", "m10"]]), T);
    expect(a.joins).toEqual([]);
    expect(a.waiting).toEqual(["m10"]);
  });

  test("the pair key does not depend on the order", () => {
    expect(neverPairSet([["b", "a"]]).has("a|b")).toBe(true);
  });
});

test("the group size limits come from the tunables", () => {
  const small = tunables({ groupSize: { min: 3, max: 4, lockedMin: 2 } });
  expect(sizes(assign(pool("wmw"), [], NONE, small))).toEqual([3]);
});
