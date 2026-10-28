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
    const facts = groupFacts(PLANS.group_confirmed, groupBeforeRevealFixture({ size: 3, belowPlan: true }));
    expect(facts).toMatchObject({ size: 3, others: 2, belowPlan: true, meetAt: "2026-10-30T13:30:00.000Z" });
  });

  test("a revealed group gives up no member and no cafe", () => {
    const facts = groupFacts(PLANS.meet_card_live, groupRevealedFixture());
    expect(Object.keys(facts ?? {}).sort()).toEqual(["belowPlan", "meetAt", "others", "revealAt", "size"]);
    expect(JSON.stringify(facts)).not.toMatch(/Asha|Rohan|Meera|Niloufer/);
  });
});
