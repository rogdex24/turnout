import { isPersistedKey, keyStartsWith, queryKeys, STALE_TIMES } from "./keys";

describe("query keys", () => {
  it("gives every key a stale time through its prefix", () => {
    const keys = [
      queryKeys.me(),
      queryKeys.config(),
      queryKeys.areas(),
      queryKeys.showsList("Bandra"),
      queryKeys.showDetail("abc"),
      queryKeys.plansList(),
      queryKeys.planDetail("p1"),
      queryKeys.group("g1"),
      queryKeys.thread("g1"),
      queryKeys.after("g1"),
      queryKeys.blocked(),
    ];
    for (const key of keys) {
      expect(STALE_TIMES.some(({ prefix }) => keyStartsWith(key, prefix))).toBe(true);
    }
  });

  it("uses the stale times from the plan", () => {
    const minute = 60_000;
    const staleFor = (key: readonly unknown[]) => STALE_TIMES.find(({ prefix }) => keyStartsWith(key, prefix))?.staleTime;
    expect(staleFor(queryKeys.me())).toBe(5 * minute);
    expect(staleFor(queryKeys.config())).toBe(60 * minute);
    expect(staleFor(queryKeys.showsList(null))).toBe(5 * minute);
    expect(staleFor(queryKeys.showDetail("x"))).toBe(minute);
    expect(staleFor(queryKeys.areas())).toBe(24 * 60 * minute);
    expect(staleFor(queryKeys.plansList())).toBe(30_000);
    expect(staleFor(queryKeys.planDetail("x"))).toBe(30_000);
    expect(staleFor(queryKeys.group("x"))).toBe(30_000);
    expect(staleFor(queryKeys.thread("x"))).toBe(0);
    expect(staleFor(queryKeys.after("x"))).toBe(5 * minute);
    expect(staleFor(queryKeys.blocked())).toBe(5 * minute);
  });

  it("persists only the allowlist", () => {
    expect(isPersistedKey(queryKeys.me())).toBe(true);
    expect(isPersistedKey(queryKeys.config())).toBe(true);
    expect(isPersistedKey(queryKeys.areas())).toBe(true);
    expect(isPersistedKey(queryKeys.showsList("Bandra"))).toBe(true);
    expect(isPersistedKey(queryKeys.showDetail("abc"))).toBe(false);
    expect(isPersistedKey(queryKeys.after("g1"))).toBe(false);
    expect(isPersistedKey(queryKeys.blocked())).toBe(false);
    expect(isPersistedKey(["something", "new"])).toBe(false);
  });
});
