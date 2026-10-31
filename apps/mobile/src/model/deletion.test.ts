import { groupWillBeTold } from "./deletion";
import { PLANS, REVEAL_AT, SHOW_STARTS_AT } from "./planFixtures";

const at = (iso: string) => Date.parse(iso);

describe("groupWillBeTold", () => {
  it("is true from the reveal, T-3h, through the show", () => {
    expect(groupWillBeTold([PLANS.meet_card_live], at(REVEAL_AT))).toBe(true);
    expect(groupWillBeTold([PLANS.meet_card_live], at(SHOW_STARTS_AT) + 30 * 60_000)).toBe(true);
  });

  it("is false before the reveal, when the group is not shown to anyone", () => {
    expect(groupWillBeTold([PLANS.group_confirmed], at(REVEAL_AT) - 1)).toBe(false);
  });

  it("is false for a plan with no group, a plan that ended, or no plans", () => {
    const now = at(REVEAL_AT) + 60_000;
    expect(groupWillBeTold([PLANS.finding_group, PLANS.needs_ticket], now)).toBe(false);
    expect(groupWillBeTold([PLANS.done, PLANS.withdrawn, PLANS.no_group], now)).toBe(false);
    expect(groupWillBeTold([], now)).toBe(false);
  });

  it("is false a day after the show", () => {
    expect(groupWillBeTold([PLANS.meet_card_live], at(SHOW_STARTS_AT) + 25 * 3_600_000)).toBe(false);
  });

  it("looks at every plan", () => {
    expect(groupWillBeTold([PLANS.needs_ticket, PLANS.meet_card_live], at(REVEAL_AT))).toBe(true);
  });
});
