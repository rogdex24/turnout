import { NOTICE_KINDS } from "@turnout/contract/app/notices";
import { holdsThreadPush, needsGroupId, parsePushData, routeForNotice, UNKNOWN_PUSH_ROUTE } from "./notificationRoute";

const ids = { planId: "plan 1", groupId: "grp1" };

describe("parsePushData", () => {
  it("takes the three fields of the payload", () => {
    expect(parsePushData({ kind: "meet_card_live", noticeId: "n1", planId: "p1" })).toEqual({
      kind: "meet_card_live",
      noticeId: "n1",
      planId: "p1",
    });
    expect(parsePushData({ kind: "no_group", noticeId: "n1", planId: null })?.planId).toBeNull();
  });

  it("drops fields the push service adds, and never reads a link from the payload", () => {
    const data = { kind: "no_group", noticeId: "n1", planId: null, projectId: "x", url: "https://example.com" };
    expect(parsePushData(data)).toEqual({ kind: "no_group", noticeId: "n1", planId: null });
  });

  it.each([
    ["a kind this build does not know", { kind: "promo", noticeId: "n1", planId: null }],
    ["no notice id", { kind: "no_group", planId: null }],
    ["nothing", undefined],
    ["a string", "meet_card_live"],
  ])("refuses %s", (_name, data) => {
    expect(parsePushData(data)).toBeNull();
  });
});

describe("routeForNotice", () => {
  it.each([
    ["ticket_approved", "/plans/plan%201"],
    ["group_confirmed", "/plans/plan%201"],
    ["group_changed", "/plans/plan%201"],
    ["group_smaller", "/plans/plan%201"],
    ["group_called_off", "/plans/plan%201"],
    ["no_group", "/plans/plan%201"],
    ["ticket_rejected", "/plans/plan%201/ticket"],
    ["handle_rejected", "/settings/social"],
    ["meet_card_live", "/groups/grp1/meet"],
    ["head_over", "/groups/grp1/meet"],
    ["thread_message", "/groups/grp1/thread"],
    // The morning-after screen is not reached by a tap yet, so it opens the plan.
    ["morning_after", "/plans/plan%201"],
  ] as const)("opens %s at %s", (kind, route) => {
    expect(routeForNotice(kind, ids)).toBe(route);
  });

  it("covers every kind the server sends", () => {
    for (const kind of NOTICE_KINDS) expect(routeForNotice(kind, ids)).toMatch(/^\//);
  });

  it("opens the plan when the group id could not be read, and Home when there is no plan either", () => {
    expect(routeForNotice("meet_card_live", { planId: "p1", groupId: null })).toBe("/plans/p1");
    expect(routeForNotice("thread_message", { planId: "p1", groupId: null })).toBe("/plans/p1");
    expect(routeForNotice("meet_card_live", { planId: null, groupId: null })).toBe("/");
    expect(routeForNotice("ticket_rejected", { planId: null, groupId: null })).toBe("/");
    expect(routeForNotice("no_group", { planId: null, groupId: null })).toBe("/");
  });

  it("keeps an id to one path segment", () => {
    expect(routeForNotice("meet_card_live", { planId: null, groupId: "../settings/profile" })).toBe("/groups/..%2Fsettings%2Fprofile/meet");
  });

  it("opens Home for a kind it does not know", () => {
    expect(routeForNotice("surprise" as never, ids)).toBe("/");
    expect(UNKNOWN_PUSH_ROUTE).toBe("/");
  });
});

describe("needsGroupId", () => {
  it("is true for the kinds that open a group screen", () => {
    expect(NOTICE_KINDS.filter(needsGroupId)).toEqual(["meet_card_live", "head_over", "thread_message"]);
  });
});

describe("holdsThreadPush", () => {
  it("holds a thread push only for the thread that is open", () => {
    expect(holdsThreadPush("thread_message", "g1", "g1")).toBe(true);
    expect(holdsThreadPush("thread_message", "g2", "g1")).toBe(false);
    expect(holdsThreadPush("thread_message", "g1", null)).toBe(false);
    expect(holdsThreadPush("meet_card_live", "g1", "g1")).toBe(false);
  });
});
