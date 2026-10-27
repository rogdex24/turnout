import { describe, expect, test } from "bun:test";
import { nextIstMidnight } from "../src/utils/time.js";
import { isUlid, ulid } from "../src/utils/ulid.js";

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

describe("nextIstMidnight", () => {
  test("is the next 00:00 IST", () => {
    // 2026-01-01 20:00 UTC is 01:30 IST on the 2nd, so the next midnight is the start of the 3rd IST.
    expect(nextIstMidnight(new Date("2026-01-01T20:00:00Z"))).toBe("2026-01-02T18:30:00.000Z");
    // 18:29 UTC is 23:59 IST on the 1st.
    expect(nextIstMidnight(new Date("2026-01-01T18:29:00Z"))).toBe("2026-01-01T18:30:00.000Z");
    expect(nextIstMidnight(new Date("2026-01-01T18:30:00Z"))).toBe("2026-01-02T18:30:00.000Z");
  });
});
