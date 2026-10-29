import { PLAN_STATES } from "@turnout/contract/app/plans";
import { PLANS, planFixture } from "./planFixtures";
import { planSteps } from "./planSteps";

describe("the steps of a plan", () => {
  test("every state has an answer, and a withdrawn plan has no steps", () => {
    for (const state of PLAN_STATES) {
      const steps = planSteps(PLANS[state]);
      if (state === "withdrawn") expect(steps).toBeNull();
      else expect(steps).toHaveLength(3);
    }
  });

  test("the step in hand is the first one that is not done", () => {
    expect(planSteps(PLANS.needs_ticket)).toEqual(["now", "pending", "pending"]);
    expect(planSteps(PLANS.finding_group)).toEqual(["done", "now_live", "pending"]);
    expect(planSteps(PLANS.group_confirmed)).toEqual(["done", "done", "now"]);
    expect(planSteps(PLANS.meet_card_live)).toEqual(["done", "done", "now_live"]);
    expect(planSteps(PLANS.done)).toEqual(["done", "done", "done"]);
  });

  test("a plan called off keeps the ticket as done only if it was accepted", () => {
    expect(planSteps(PLANS.no_group)).toEqual(["done", "off", "off"]);
    expect(planSteps(planFixture({ state: "no_group", reason: "no_ticket", ticket: null }))).toEqual(["off", "off", "off"]);
  });
});
