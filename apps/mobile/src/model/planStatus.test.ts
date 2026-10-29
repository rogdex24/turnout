import { PLAN_STATES } from "@turnout/contract/app/plans";
import { PLANS, planFixture } from "./planFixtures";
import { planStatus } from "./planStatus";

describe("the status line of a plan", () => {
  test("every state has one, and only a live search or a live meet card reads as live", () => {
    const live = PLAN_STATES.filter((state) => planStatus(PLANS[state]).tone === "live");
    expect(live).toEqual(["finding_group", "meet_card_live"]);
  });

  test("something to do reads as an action", () => {
    expect(planStatus(PLANS.needs_ticket)).toMatchObject({ key: "needs_ticket", tone: "action" });
    expect(planStatus(PLANS.ticket_rejected)).toMatchObject({ key: "ticket_rejected", tone: "action" });
  });

  test("a plan with no group reads as called off, unless the ticket was the reason", () => {
    expect(planStatus(planFixture({ state: "no_group", reason: "no_match" })).key).toBe("called_off");
    expect(planStatus(planFixture({ state: "no_group", reason: "group_called_off" })).key).toBe("called_off");
    expect(planStatus(planFixture({ state: "no_group", reason: "handle_rejected" })).key).toBe("called_off");
    for (const reason of ["no_ticket", "late_review", "ticket_rejected"] as const) {
      expect(planStatus(planFixture({ state: "no_group", reason })).key).toBe("closed");
    }
  });

  test("a finished plan counts the others, not the person", () => {
    expect(planStatus(PLANS.done).others).toBe(4);
    expect(planStatus(planFixture({ state: "done", group: null })).others).toBe(0);
  });
});
