import { ApiError } from "@/model/apiError";
import { createApiClient } from "./client";
import { createConnectivity } from "./connectivity";
import { groupBeforeRevealFixture, groupFixture, MEMBERS, planFixture } from "./groupFixtures";
import { fetchMeetContext, isRevealed, markCheckedIn, planOfGroup, retryCheckin, sendCheckin } from "./groups";
import { showDetailFixture } from "./showFixtures";
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

describe("planOfGroup", () => {
  it("finds the plan that holds the group", () => {
    const plans = [planFixture({ id: "a", group: null }), planFixture({ id: "b" })];
    expect(planOfGroup(plans, "g1")?.id).toBe("b");
    expect(planOfGroup(plans, "other")).toBeNull();
  });
});

describe("isRevealed", () => {
  it("is true only when the cafe and the members are there", () => {
    expect(isRevealed(groupFixture())).toBe(true);
    expect(isRevealed(groupBeforeRevealFixture())).toBe(false);
  });
});

describe("markCheckedIn", () => {
  it("marks only the person's own tile", () => {
    const group = markCheckedIn(groupFixture());
    expect(isRevealed(group) && group.members.map((member) => member.checkedIn)).toEqual(MEMBERS.map((member) => member.isYou));
  });

  it("leaves a group that is not revealed as it is", () => {
    const before = groupBeforeRevealFixture();
    expect(markCheckedIn(before)).toBe(before);
  });
});

describe("fetchMeetContext", () => {
  const plans = { "GET /plans": json(200, { plans: [planFixture()] }) };

  it("takes the venue pin from the public show", async () => {
    const { api, net } = setup({
      ...plans,
      "GET /api/events/traffic-jam-tales": json(
        200,
        showDetailFixture({ venue: { name: "Shilpa Kala Vedika", area: "hitec-city", lat: 17.45, lng: 78.38 } }),
      ),
    });
    await expect(fetchMeetContext(api, "g1")).resolves.toEqual({
      planId: "plan-1",
      eventId: "traffic-jam-tales",
      venue: { name: "Shilpa Kala Vedika", point: { lat: 17.45, lng: 78.38 } },
    });
    expect(net.calls.find((call) => call.url.includes("/api/events/"))?.headers.authorization).toBeUndefined();
  });

  it("has no pin when the show has no coordinates", async () => {
    const { api } = setup({
      ...plans,
      "GET /api/events/traffic-jam-tales": json(
        200,
        showDetailFixture({ venue: { name: null, area: "hitec-city", lat: null, lng: null } }),
      ),
    });
    expect((await fetchMeetContext(api, "g1"))?.venue).toEqual({ name: null, point: null });
  });

  it("keeps the plan when the show is gone", async () => {
    const { api } = setup({ ...plans, "GET /api/events/traffic-jam-tales": json(404, { error: "not_found" }) });
    expect(await fetchMeetContext(api, "g1")).toEqual({
      planId: "plan-1",
      eventId: "traffic-jam-tales",
      venue: { name: null, point: null },
    });
  });

  it("is null when no plan holds the group", async () => {
    const { api } = setup(plans);
    expect(await fetchMeetContext(api, "nope")).toBeNull();
  });

  it("does not hide a failing show behind an empty pin", async () => {
    const { api } = setup({ ...plans, "GET /api/events/traffic-jam-tales": json(500, { error: "server" }) });
    await expect(fetchMeetContext(api, "g1")).rejects.toMatchObject({ kind: "server" });
  });
});

describe("sendCheckin", () => {
  it("posts an empty body with nothing about where the phone is", async () => {
    const { api, net } = setup({ "POST /groups/g1/checkin": json(200, { checkedIn: true }) });
    await sendCheckin(api)({ clientId: "c1", payload: { groupId: "g1" } });
    expect(net.calls[0]?.method).toBe("POST");
    expect(JSON.parse(String(net.calls[0]?.body))).toEqual({});
  });
});

describe("retryCheckin", () => {
  it("tries again after a bad connection or a busy server, up to three times", () => {
    expect(retryCheckin(0, new ApiError("offline", null, null))).toBe(true);
    expect(retryCheckin(1, new ApiError("server", 503, null))).toBe(true);
    expect(retryCheckin(3, new ApiError("server", 503, null))).toBe(false);
  });

  it("does not try again after a refusal", () => {
    expect(retryCheckin(0, new ApiError("validation", 409, "outside_checkin_window"))).toBe(false);
    expect(retryCheckin(0, new ApiError("not_found", 404, null))).toBe(false);
  });
});
