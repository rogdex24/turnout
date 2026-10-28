import { describe, expect, test } from "bun:test";
import { nextIstMidnight } from "../src/utils/time.js";
import { isUlid, ulid, ulidAfter } from "../src/utils/ulid.js";

describe("ulid", () => {
  test("is 26 lowercase Crockford characters", () => {
    expect(isUlid(ulid())).toBe(true);
    expect(isUlid(ulid().toUpperCase())).toBe(false);
    expect(isUlid("short")).toBe(false);
  });

  test("sorts by time, and by call order inside one millisecond", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const ids = [ulid(new Date(at.getTime() - 5)), ulid(at), ulid(at), ulid(at), ulid(new Date(at.getTime() + 1))];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ulidAfter", () => {
  const at = new Date("2026-01-01T00:00:00Z");

  test("is an ordinary ULID for the time when that is already above the floor", () => {
    const floor = ulid(new Date(at.getTime() - 1000));
    const id = ulidAfter(floor, at);
    expect(id > floor).toBe(true);
    expect(id.slice(0, 10)).toBe(ulid(at).slice(0, 10));
  });

  test("is just above the floor when the time is earlier, and carries across the random part", () => {
    const floor = ulid(new Date(at.getTime() + 5000));
    const above = ulidAfter(floor, at);
    expect(above > floor).toBe(true);
    expect(isUlid(above)).toBe(true);
    expect(above.slice(0, 10)).toBe(floor.slice(0, 10));
    expect(ulidAfter("01m72htrw0zzzzzzzzzzzzzzzz", at)).toBe(`01m72htrw1${"0".repeat(16)}`);
    expect(ulidAfter("", at) > "").toBe(true);
  });
});

describe("nextIstMidnight", () => {
  test("is the next 00:00 IST", () => {
    // 2026-01-01 20:00 UTC is 01:30 IST on the 2nd, so the next midnight is the start of the 3rd IST.
    expect(nextIstMidnight(new Date("2026-01-01T20:00:00Z"))).toBe("2026-01-02T18:30:00.000Z");
    // 18:29 UTC is 23:59 IST on the 1st.
    expect(nextIstMidnight(new Date("2026-01-01T18:29:00Z"))).toBe("2026-01-01T18:30:00.000Z");
    expect(nextIstMidnight(new Date("2026-01-01T18:30:00Z"))).toBe("2026-01-02T18:30:00.000Z");
  });
});
