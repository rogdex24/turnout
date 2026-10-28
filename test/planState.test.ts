import { expect, test } from "bun:test";
import { PLAN_STATES, type PlanState, TERMINAL_PLAN_STATES, WITHDRAWN_REASONS } from "@turnout/contract/app/plans";
import { InvalidPlanTransition, lapseReason, type PlanEvent, planTransition } from "../src/social/model/planState.js";

/** Every allowed move, written out from the plan's table. Anything not here has to throw. */
const ALLOWED: [PlanState, PlanEvent, PlanState][] = [
  ["needs_ticket", { type: "ticket_uploaded" }, "checking_ticket"],
  ["ticket_rejected", { type: "ticket_uploaded" }, "checking_ticket"],
  ["checking_ticket", { type: "ticket_approved" }, "finding_group"],
  ["checking_ticket", { type: "ticket_rejected" }, "ticket_rejected"],
  ["finding_group", { type: "group_placed" }, "group_confirmed"],
  ["group_confirmed", { type: "group_dissolved" }, "finding_group"],
  ["group_confirmed", { type: "group_called_off" }, "no_group"],
  ["meet_card_live", { type: "group_called_off" }, "no_group"],
  ["group_confirmed", { type: "reveal" }, "meet_card_live"],
  ["meet_card_live", { type: "morning_after" }, "done"],
  ["needs_ticket", { type: "lock_lapsed", handle: null }, "no_group"],
  ["checking_ticket", { type: "lock_lapsed", handle: null }, "no_group"],
  ["ticket_rejected", { type: "lock_lapsed", handle: null }, "no_group"],
  ["finding_group", { type: "lock_lapsed", handle: "approved" }, "no_group"],
  ...PLAN_STATES.filter((s) => !(TERMINAL_PLAN_STATES as readonly string[]).includes(s)).map(
    (s) => [s, { type: "withdraw", reason: "cancelled" }, "withdrawn"] as [PlanState, PlanEvent, PlanState],
  ),
];

const EVENTS: PlanEvent[] = [
  { type: "ticket_uploaded" },
  { type: "ticket_approved" },
  { type: "ticket_rejected" },
  { type: "group_placed" },
  { type: "group_dissolved" },
  { type: "group_called_off" },
  { type: "reveal" },
  { type: "morning_after" },
  { type: "lock_lapsed", handle: null },
  { type: "withdraw", reason: "cancelled" },
];

test("every allowed move lands where the table says", () => {
  for (const [from, event, to] of ALLOWED) expect(planTransition(from, event).state).toBe(to);
});

test("every other pair of state and event throws", () => {
  const allowed = new Set(ALLOWED.map(([from, event]) => `${from}/${event.type}`));
  let thrown = 0;
  for (const from of PLAN_STATES) {
    for (const event of EVENTS) {
      if (allowed.has(`${from}/${event.type}`)) continue;
      expect(() => planTransition(from, event)).toThrow(InvalidPlanTransition);
      thrown++;
    }
  }
  expect(thrown).toBe(PLAN_STATES.length * EVENTS.length - allowed.size);
});

test("a terminal plan never moves", () => {
  for (const from of TERMINAL_PLAN_STATES) {
    for (const event of EVENTS) expect(() => planTransition(from, event)).toThrow(InvalidPlanTransition);
  }
});

test("a reason comes with no_group and withdrawn and with nothing else", () => {
  for (const [from, event] of ALLOWED) {
    const result = planTransition(from, event);
    expect(result.reason !== null).toBe(result.state === "no_group" || result.state === "withdrawn");
  }
});

test("a lapse names what was missing when the lock came", () => {
  expect(lapseReason("needs_ticket", null)).toBe("no_ticket");
  expect(lapseReason("checking_ticket", null)).toBe("late_review");
  expect(lapseReason("ticket_rejected", null)).toBe("ticket_rejected");
  expect(lapseReason("finding_group", "pending")).toBe("handle_pending");
  expect(lapseReason("finding_group", "rejected")).toBe("handle_rejected");
  expect(lapseReason("finding_group", "approved")).toBe("no_match");
  expect(lapseReason("finding_group", null)).toBe("no_match");
  expect(() => lapseReason("group_confirmed", null)).toThrow(InvalidPlanTransition);
});

test("the lapse event carries the reason from the plan's state and handle", () => {
  expect(planTransition("checking_ticket", { type: "lock_lapsed", handle: null })).toEqual({ state: "no_group", reason: "late_review" });
  expect(planTransition("finding_group", { type: "lock_lapsed", handle: "pending" })).toEqual({
    state: "no_group",
    reason: "handle_pending",
  });
});

test("a withdrawal keeps the reason it was given, and only a withdrawn reason is accepted", () => {
  for (const reason of WITHDRAWN_REASONS) {
    expect(planTransition("finding_group", { type: "withdraw", reason })).toEqual({ state: "withdrawn", reason });
  }
});

test("a called-off group ends the plan with its reason", () => {
  expect(planTransition("meet_card_live", { type: "group_called_off" })).toEqual({ state: "no_group", reason: "group_called_off" });
});
