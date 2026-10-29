import { fireEvent, render, screen } from "@testing-library/react-native";
import { queryKeys } from "@/api/keys";
import { confirmedPlayed, markConfirmedPlayed } from "@/api/prefs";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { common } from "@/copy/common";
import { plan as copy } from "@/copy/plan";
import { ticket as ticketCopy } from "@/copy/ticket";
import { groupBeforeRevealFixture, groupRevealedFixture, memberShowFixture, PLANS, planFixture, REVEAL_AT } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { moments } from "@/ui/moments";
import { PlanScreen } from "./PlanScreen";

jest.mock("@/ui/moments", () => ({ moments: { groupConfirmed: jest.fn() } }));

/** 1:30 PM in Hyderabad on show day: before the names open at 5:00 PM. */
const BEFORE_REVEAL = Date.parse("2026-10-30T08:00:00.000Z");
const AFTER_REVEAL = Date.parse(REVEAL_AT) + 60_000;
const NAMES = ["Asha", "Rohan", "Meera", "Cafe Niloufer"];

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(moments.groupConfirmed).mockClear();
  clearTestClients();
});

async function open(
  plan: ReturnType<typeof planFixture>,
  routes: Record<string, RouteReply | RouteReply[]> = {},
  at = BEFORE_REVEAL,
  played = false,
  seed?: (app: Awaited<ReturnType<typeof createTestApp>>) => void,
) {
  // The clock starts at `at` and keeps running, so waiting in the test still times out.
  const real = Date.now.bind(Date);
  const start = real();
  jest.spyOn(Date, "now").mockImplementation(() => at + (real() - start));
  const handlers = {
    onBack: jest.fn(),
    onAddTicket: jest.fn(),
    onOpenMeetCard: jest.fn(),
    onLeave: jest.fn(),
    onFindShow: jest.fn(),
    onChangeHandle: jest.fn(),
    onPlans: jest.fn(),
  };
  const app = await createTestApp({
    me: meFixture(),
    welcomeSeen: true,
    routes: {
      [`GET /plans/${plan.id}`]: json(200, plan),
      "GET /shows/monsoon-theory": json(200, memberShowFixture()),
      ...(plan.group ? { [`GET /groups/${plan.group.id}`]: json(200, groupRevealedFixture()) } : {}),
      ...routes,
    },
  });
  if (played) markConfirmedPlayed(app.prefs, plan.id);
  seed?.(app);
  await render(
    <AppProviders deps={app.deps}>
      <PlanScreen planId={plan.id} {...handlers} />
    </AppProviders>,
  );
  return { ...app, ...handlers };
}

describe("PlanScreen", () => {
  describe("names", () => {
    it("shows no member name, photo or cafe before T-3h, even if the server sent them", async () => {
      await open(PLANS.group_confirmed);
      expect(await screen.findByTestId("plan-reveal")).toBeOnTheScreen();
      for (const name of NAMES) expect(screen.queryByText(new RegExp(name))).toBeNull();
      expect(screen.queryByTestId("person-avatar")).toBeNull();
      // The size, and the time the names open in IST.
      expect(screen.getByText("4")).toBeOnTheScreen();
      expect(screen.getByText(copy.confirmed.reveal.label(4))).toBeOnTheScreen();
      expect(screen.getByText(copy.confirmed.reveal.when("5:00 PM"))).toBeOnTheScreen();
      expect(screen.getByText(copy.confirmed.body("5:00 PM"))).toBeOnTheScreen();
    });

    it("keeps the plan page to counts and times after T-3h too: the meet card is where people are shown", async () => {
      await open(PLANS.meet_card_live, {}, AFTER_REVEAL);
      expect(await screen.findByText(copy.live.title)).toBeOnTheScreen();
      for (const name of NAMES) expect(screen.queryByText(new RegExp(name))).toBeNull();
    });

    it("draws nothing per person on a group that is not yet in", async () => {
      await open(PLANS.group_confirmed, { "GET /groups/group-1": json(200, groupBeforeRevealFixture()) });
      await screen.findByTestId("plan-reveal");
      expect(screen.queryByText(/Asha|Rohan|Meera/)).toBeNull();
    });
  });

  describe("group size", () => {
    it("says so when the group is smaller than usual, and goes ahead with N", async () => {
      const smaller = planFixture({ ...PLANS.group_confirmed, group: { ...PLANS.group_confirmed.group!, size: 3 } });
      await open(smaller, {
        "GET /groups/group-1": json(200, groupBeforeRevealFixture({ size: 3, belowPlan: true })),
      });
      expect(await screen.findByText(copy.confirmed.smaller(3))).toBeOnTheScreen();
      expect(screen.getByText("2")).toBeOnTheScreen();
    });

    it("adds no note for a full group", async () => {
      await open(PLANS.group_confirmed, { "GET /groups/group-1": json(200, groupBeforeRevealFixture()) });
      await screen.findByTestId("plan-reveal");
      expect(screen.queryByText(/Fewer people than usual/)).toBeNull();
    });

    it("falls back to the size on the plan when the group cannot be read", async () => {
      await open(PLANS.group_confirmed, { "GET /groups/group-1": json(400, { code: "bad_request" }) });
      expect(await screen.findByText("4")).toBeOnTheScreen();
      expect(screen.queryByText(/Fewer people than usual/)).toBeNull();
    });

    it("says when the group meets, in IST", async () => {
      await open(PLANS.group_confirmed, { "GET /groups/group-1": json(200, groupBeforeRevealFixture()) });
      expect(await screen.findByText(copy.confirmed.meetAround("7:00 PM"))).toBeOnTheScreen();
    });
  });

  describe("states", () => {
    it("asks for the ticket and opens the ticket page", async () => {
      const app = await open(PLANS.needs_ticket);
      expect(await screen.findByText(copy.needsTicket.body)).toBeOnTheScreen();
      expect(screen.getByTestId("plan-steps")).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId("plan-add-ticket"));
      expect(app.onAddTicket).toHaveBeenCalled();
    });

    it("says the ticket is being checked, with nothing to do", async () => {
      await open(PLANS.checking_ticket);
      expect(await screen.findByText(copy.checking.title)).toBeOnTheScreen();
      expect(screen.queryByTestId("plan-dock")).toBeNull();
      expect(screen.getByText(copy.rows.ticketChecking)).toBeOnTheScreen();
    });

    it("gives the reason a ticket was not used and a way to send another", async () => {
      const app = await open(PLANS.ticket_rejected);
      expect(await screen.findByText(ticketCopy.rejected.reasons.unreadable)).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId("plan-send-another"));
      expect(app.onAddTicket).toHaveBeenCalled();
    });

    it("says how many are looking, when it is known, and when groups are set", async () => {
      await open(PLANS.finding_group);
      expect(await screen.findByText(copy.finding.looking(7))).toBeOnTheScreen();
      expect(screen.getByText(copy.finding.setBy("Thu 29 Oct, 8:00 PM"))).toBeOnTheScreen();
    });

    it("leaves the count out when it is not known", async () => {
      await open(PLANS.finding_group, { "GET /shows/monsoon-theory": json(400, { code: "bad_request" }) });
      expect(await screen.findByText(copy.finding.none)).toBeOnTheScreen();
    });

    it("opens the meet card of its group when it is live", async () => {
      const app = await open(PLANS.meet_card_live);
      await fireEvent.press(await screen.findByTestId("plan-open-meet"));
      expect(app.onOpenMeetCard).toHaveBeenCalledWith("group-1");
    });

    it.each([
      ["no_match", copy.noGroup.reasons.no_match, copy.noGroup.pill],
      ["group_called_off", copy.noGroup.reasons.group_called_off, copy.noGroup.pill],
      ["handle_pending", copy.noGroup.reasons.handle_pending, copy.noGroup.pill],
      ["no_ticket", copy.noGroup.reasons.no_ticket, copy.noGroup.closedPill],
      ["late_review", copy.noGroup.reasons.late_review, copy.noGroup.closedPill],
    ] as const)("explains a plan with no group, reason %s", async (reason, text, pill) => {
      const app = await open(planFixture({ ...PLANS.no_group, reason }));
      expect(await screen.findByText(text)).toBeOnTheScreen();
      expect(screen.getByText(pill)).toBeOnTheScreen();
      expect(screen.queryByTestId("plan-leave")).toBeNull();
      await fireEvent.press(screen.getByTestId("plan-find-show"));
      expect(app.onFindShow).toHaveBeenCalled();
    });

    it("offers a way to change the profile link when it was the reason", async () => {
      const app = await open(planFixture({ ...PLANS.no_group, reason: "handle_rejected" }));
      await fireEvent.press(await screen.findByTestId("plan-change-handle"));
      expect(app.onChangeHandle).toHaveBeenCalled();
      expect(screen.getByTestId("plan-find-show")).toBeOnTheScreen();
    });

    it("says the person left, and that the ticket is untouched", async () => {
      await open(PLANS.withdrawn);
      expect(await screen.findByText(copy.withdrawn.title)).toBeOnTheScreen();
      expect(screen.getByText(copy.withdrawn.reasons.cancelled)).toBeOnTheScreen();
    });

    it("says how many the person went with when done", async () => {
      await open(PLANS.done);
      expect(await screen.findByText(copy.done.withGroup(4))).toBeOnTheScreen();
    });

    it("opens the leave sheet from the last row", async () => {
      const app = await open(PLANS.finding_group);
      await fireEvent.press(await screen.findByTestId("plan-leave"));
      expect(app.onLeave).toHaveBeenCalled();
    });

    it("shows the show and its time in IST", async () => {
      await open(PLANS.finding_group);
      expect(await screen.findByText("Fri 30 Oct, 8:00 PM")).toBeOnTheScreen();
      expect(screen.getByText("Phoenix Arena")).toBeOnTheScreen();
    });
  });

  describe("group confirmed moment", () => {
    it("plays once for a plan and remembers it", async () => {
      const app = await open(PLANS.group_confirmed);
      await screen.findByTestId("plan-reveal");
      expect(moments.groupConfirmed).toHaveBeenCalledTimes(1);
      expect(confirmedPlayed(app.prefs, PLANS.group_confirmed.id)).toBe(true);
    });

    it("does not play again on a later visit", async () => {
      await open(PLANS.group_confirmed, {}, BEFORE_REVEAL, true);
      await screen.findByTestId("plan-reveal");
      expect(moments.groupConfirmed).not.toHaveBeenCalled();
    });

    it("does not play for another state", async () => {
      await open(PLANS.finding_group);
      await screen.findByText(copy.finding.title);
      expect(moments.groupConfirmed).not.toHaveBeenCalled();
    });
  });

  describe("loading and failing", () => {
    it("says so when the plan is not there", async () => {
      const app = await open(planFixture({ id: "plan-gone" }), { "GET /plans/plan-gone": json(404, { code: "not_found" }) });
      await fireEvent.press(await screen.findByText(copy.missing.action));
      expect(app.onPlans).toHaveBeenCalled();
    });

    it("opens from the kept plan list while its own answer is not in", async () => {
      const plan = PLANS.checking_ticket;
      await open(plan, { [`GET /plans/${plan.id}`]: () => new Promise(() => {}) }, BEFORE_REVEAL, false, (app) =>
        app.queryClient.setQueryData(queryKeys.plansList(), { plans: [plan] }),
      );
      expect(await screen.findByText(copy.checking.title)).toBeOnTheScreen();
    });

    it("says it is offline, not loading forever, for a plan never seen", async () => {
      await open(planFixture({ id: "plan-unseen" }), {}, BEFORE_REVEAL, false, (app) => app.deps.connectivity.report(false));
      expect(await screen.findByText(common.errorOffline)).toBeOnTheScreen();
    });

    it("shows a plain error with a retry", async () => {
      await open(planFixture({ id: "plan-bad" }), { "GET /plans/plan-bad": json(400, { code: "bad_request" }) });
      expect(await screen.findByText(common.errorTitle)).toBeOnTheScreen();
    });
  });
});
