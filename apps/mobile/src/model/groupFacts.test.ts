import { groupFacts } from "./groupFacts";
import { groupBeforeRevealFixture, groupRevealedFixture, PLANS } from "./planFixtures";

describe("what the plan page knows of a group", () => {
  test("a plan with no group has none", () => {
    expect(groupFacts(PLANS.finding_group, undefined)).toBeNull();
  });

  test("without the group answer, the plan's own size and reveal are used", () => {
    expect(groupFacts(PLANS.group_confirmed, undefined)).toEqual({
      size: 5,
      others: 4,
      belowPlan: null,
      revealAt: "2026-10-30T11:30:00.000Z",
      meetAt: null,
    });
  });

  test("the group answer adds the smaller-than-usual flag and the meeting time", () => {
    const plan = { group: { ...PLANS.group_confirmed.group!, size: 3 } };
    const facts = groupFacts(plan, groupBeforeRevealFixture({ size: 3, belowPlan: true }));
    expect(facts).toMatchObject({ size: 3, others: 2, belowPlan: true, meetAt: "2026-10-30T13:30:00.000Z" });
  });

  test("the polled plan's size wins over an older group answer", () => {
    const plan = { group: { ...PLANS.group_confirmed.group!, size: 3 } };
    expect(groupFacts(plan, groupBeforeRevealFixture({ size: 4, belowPlan: false }))?.size).toBe(3);
  });

  test("a revealed group gives up no member and no cafe", () => {
    const facts = groupFacts(PLANS.meet_card_live, groupRevealedFixture());
    expect(Object.keys(facts ?? {}).sort()).toEqual(["belowPlan", "meetAt", "others", "revealAt", "size"]);
    expect(JSON.stringify(facts)).not.toMatch(/Asha|Rohan|Meera|Niloufer/);
  });
});
