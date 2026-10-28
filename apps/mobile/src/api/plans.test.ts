import { isApiError } from "../model/apiError";
import { groupBeforeRevealFixture, groupRevealedFixture, memberShowFixture, PLANS, planFixture } from "../model/planFixtures";
import { createApiClient } from "./client";
import { createConnectivity } from "./connectivity";
import { keyStartsWith, queryKeys } from "./keys";
import {
  createPlan,
  fetchGroup,
  fetchMemberShow,
  fetchPlan,
  fetchPlans,
  memberShowQuery,
  planDetailQuery,
  plansListQuery,
  putTicket,
  withdrawPlan,
} from "./plans";
import { clearTestClients, json, routedTransport } from "./testing";

afterEach(() => clearTestClients());

function setup(routes: Parameters<typeof routedTransport>[0]) {
  const net = routedTransport(routes);
  const api = createApiClient({
    origin: "http://test.local",
    session: { accessToken: async () => "token", refreshAfterUnauthorised: async () => null, signOut: async () => undefined },
    connectivity: createConnectivity(),
    transport: net.transport,
  });
  return { net, api };
}

describe("reads", () => {
  it("lists the plans and reads one", async () => {
    const { net, api } = setup({
      "GET /plans": json(200, { plans: [PLANS.finding_group] }),
      "GET /plans/plan-4": json(200, PLANS.finding_group),
    });
    expect((await fetchPlans(api)).plans.map((p) => p.state)).toEqual(["finding_group"]);
    expect((await fetchPlan(api, "plan-4")).id).toBe("plan-4");
    expect(net.calls[0]?.headers.authorization).toBe("Bearer token");
  });

  it("reads the member's view of a show with the plan in it", async () => {
    const { api } = setup({ "GET /shows/monsoon-theory": json(200, memberShowFixture({ plan: PLANS.needs_ticket })) });
    const show = await fetchMemberShow(api, "monsoon-theory");
    expect(show.proofKind).toBe("screenshot");
    expect(show.plan?.state).toBe("needs_ticket");
  });

  it("reads a group before and after the reveal", async () => {
    const { api } = setup({
      "GET /groups/g1": json(200, groupBeforeRevealFixture({ belowPlan: true, size: 3 })),
      "GET /groups/g2": json(200, groupRevealedFixture()),
    });
    const before = await fetchGroup(api, "g1");
    expect("members" in before).toBe(false);
    expect(before.belowPlan).toBe(true);
    const after = await fetchGroup(api, "g2");
    expect("members" in after && after.members.length).toBe(3);
  });

  it("keeps each query under the key the cache and the disk allowlist know", () => {
    const { api } = setup({});
    expect(plansListQuery(api).queryKey).toEqual(queryKeys.plansList());
    expect(planDetailQuery(api, "p").queryKey).toEqual(queryKeys.planDetail("p"));
    expect(keyStartsWith(memberShowQuery(api, "x").queryKey, ["shows", "member"])).toBe(true);
  });
});

describe("writes", () => {
  it("makes a plan with the show's public id and the group type", async () => {
    const { net, api } = setup({ "POST /plans": json(201, PLANS.needs_ticket) });
    const plan = await createPlan(api, { eventId: "monsoon-theory", groupType: "women_only" });
    expect(plan.state).toBe("needs_ticket");
    expect(JSON.parse(String(net.calls[0]?.body))).toEqual({ eventId: "monsoon-theory", groupType: "women_only" });
  });

  it("says which plan a 409 plan_exists is about, and what a not_matchable lacks", async () => {
    const { api } = setup({
      "POST /plans": [
        json(409, { error: { code: "plan_exists", message: "m", planId: "plan-9" } }),
        json(409, { error: { code: "not_matchable", message: "m", missing: ["photo"] } }),
      ],
    });
    const exists = await createPlan(api, { eventId: "e", groupType: "open" }).catch((e) => e);
    expect(isApiError(exists) && exists.detail.planId).toBe("plan-9");
    const missing = await createPlan(api, { eventId: "e", groupType: "open" }).catch((e) => e);
    expect(isApiError(missing) && missing.detail.missing).toEqual(["photo"]);
  });

  it("withdraws with an empty body", async () => {
    const { net, api } = setup({ "POST /plans/p1/withdraw": json(200, planFixture({ state: "withdrawn", reason: "cancelled" })) });
    expect((await withdrawPlan(api, "p1")).state).toBe("withdrawn");
    expect(net.calls[0]?.body).toBe("{}");
  });

  it("sends the ticket file as the raw body and reports progress", async () => {
    const { net, api } = setup({ "PUT /plans/p1/ticket": json(200, PLANS.checking_ticket) });
    const file = new Blob(["abc"], { type: "image/png" });
    const progress = jest.fn();
    const plan = await putTicket(api, "p1", file, progress);
    expect(plan.state).toBe("checking_ticket");
    expect(net.calls[0]?.body).toBe(file);
    expect(net.calls[0]?.onProgress).toBe(progress);
    expect(net.calls[0]?.headers["content-type"]).toBeUndefined();
  });
});
