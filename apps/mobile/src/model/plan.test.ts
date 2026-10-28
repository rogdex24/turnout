import { activePlan, assertNever, badgeCount, groupPlans, isTerminal, needsPerson, othersCount } from "./plan";
import { PLANS, planFixture } from "./planFixtures";

describe("needsPerson", () => {
  test("is true for a missing or turned-down ticket and for a live meet card", () => {
    expect(
      Object.values(PLANS)
        .filter(needsPerson)
        .map((p) => p.state),
    ).toEqual(["needs_ticket", "ticket_rejected", "meet_card_live"]);
  });

  test("counts them for the tab badge", () => {
    expect(badgeCount(Object.values(PLANS))).toBe(3);
    expect(badgeCount([])).toBe(0);
  });
});

describe("isTerminal", () => {
  test("matches the contract's terminal states", () => {
    expect(
      Object.values(PLANS)
        .filter((p) => isTerminal(p.state))
        .map((p) => p.state),
    ).toEqual(["no_group", "withdrawn", "done"]);
  });
});

describe("groupPlans", () => {
  const early = planFixture({ id: "a", show: { title: "A", startsAt: "2026-11-01T10:00:00Z", venueName: "v" } });
  const late = planFixture({ id: "b", show: { title: "B", startsAt: "2026-11-09T10:00:00Z", venueName: "v" } });
  const oldDone = planFixture({ id: "c", state: "done", show: { title: "C", startsAt: "2026-10-01T10:00:00Z", venueName: "v" } });
  const newDone = planFixture({ id: "d", state: "no_group", show: { title: "D", startsAt: "2026-10-10T10:00:00Z", venueName: "v" } });

  test("puts the nearest show first among upcoming and the latest first among past", () => {
    const { upcoming, past } = groupPlans([late, oldDone, early, newDone]);
    expect(upcoming.map((p) => p.id)).toEqual(["a", "b"]);
    expect(past.map((p) => p.id)).toEqual(["d", "c"]);
  });

  test("does not change the list it was given", () => {
    const given = [late, early];
    groupPlans(given);
    expect(given.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("activePlan", () => {
  test("is null with no plan that can still move", () => {
    expect(activePlan([])).toBeNull();
    expect(activePlan([PLANS.done, PLANS.withdrawn])).toBeNull();
  });

  test("prefers a plan that needs the person, then the nearest show", () => {
    const soonWaiting = planFixture({
      id: "w",
      state: "finding_group",
      show: { title: "W", startsAt: "2026-11-01T10:00:00Z", venueName: "v" },
    });
    const laterTicket = planFixture({
      id: "t",
      state: "needs_ticket",
      show: { title: "T", startsAt: "2026-11-09T10:00:00Z", venueName: "v" },
    });
    expect(activePlan([soonWaiting, laterTicket])?.id).toBe("t");
    expect(activePlan([soonWaiting])?.id).toBe("w");
  });
});

test("othersCount leaves the person out", () => {
  expect(othersCount(5)).toBe(4);
  expect(othersCount(0)).toBe(0);
});

test("assertNever throws for a value that should be impossible", () => {
  expect(() => assertNever("surprise" as never)).toThrow("Unhandled value: surprise");
});
