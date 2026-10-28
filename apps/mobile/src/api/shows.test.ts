import { InfiniteQueryObserver } from "@tanstack/react-query";
import { ApiError } from "../model/apiError";
import { createApiClient } from "./client";
import { createConnectivity } from "./connectivity";
import { keyStartsWith, queryKeys } from "./keys";
import { areasBody, eventPage, SHOWS, showDetailFixture } from "./showFixtures";
import { areasQuery, showDetailQuery, showsListQuery } from "./shows";
import { clearTestClients, json, routedTransport, testQueryClient } from "./testing";

afterEach(() => clearTestClients());

function setup(routes: Parameters<typeof routedTransport>[0]) {
  const net = routedTransport(routes);
  const api = createApiClient({
    origin: "http://test.local",
    // The catalogue is public. A call that asked for a token would throw here.
    session: {
      accessToken: async () => {
        throw new Error("the catalogue must not send a token");
      },
      refreshAfterUnauthorised: async () => null,
      signOut: async () => undefined,
    },
    connectivity: createConnectivity(),
    transport: net.transport,
  });
  return { net, api, queryClient: testQueryClient() };
}

describe("showsListQuery", () => {
  it("asks for group-eligible shows only, with the area when one is chosen", async () => {
    const { net, api, queryClient } = setup({ "GET /api/events": json(200, eventPage(SHOWS.slice(0, 2))) });
    await queryClient.fetchInfiniteQuery(showsListQuery(api, "hitec-city"));
    const url = new URL(net.calls[0]?.url ?? "");
    expect(url.pathname).toBe("/api/events");
    expect(url.searchParams.get("group_eligible")).toBe("1");
    expect(url.searchParams.get("area")).toBe("hitec-city");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(net.calls[0]?.headers.authorization).toBeUndefined();
  });

  it("leaves the area out for every area and follows the cursor to the next page", async () => {
    const { net, api, queryClient } = setup({
      "GET /api/events": [json(200, eventPage(SHOWS.slice(0, 2), "c2")), json(200, eventPage(SHOWS.slice(2), null))],
    });
    const options = showsListQuery(api, null);
    const observer = new InfiniteQueryObserver(queryClient, options);
    const first = await observer.refetch();
    expect(first.data?.pages).toHaveLength(1);
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    const both = await observer.fetchNextPage();
    expect(both.data?.pages.map((p) => p.events.length)).toEqual([2, 3]);
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    expect(new URL(net.calls[0]?.url ?? "").searchParams.has("area")).toBe(false);
    expect(new URL(net.calls[1]?.url ?? "").searchParams.get("cursor")).toBe("c2");
  });

  it("is kept under the shows list key, which is the one written to disk", () => {
    const { api } = setup({});
    expect(keyStartsWith(showsListQuery(api, "x").queryKey, ["shows", "list"])).toBe(true);
    expect(showsListQuery(api, "x").queryKey).toEqual(queryKeys.showsList("x"));
  });

  it("fails as a server error when the answer is not a show list", async () => {
    const { api, queryClient } = setup({ "GET /api/events": json(200, { events: "nope" }) });
    queryClient.setQueryDefaults(queryKeys.showsList(null), { retry: false });
    await expect(queryClient.fetchInfiniteQuery(showsListQuery(api, null))).rejects.toMatchObject({ kind: "server", code: "bad_response" });
  });
});

describe("areasQuery", () => {
  it("reads the areas from the catalogue tools path, outside the app API", async () => {
    const { net, api, queryClient } = setup({ "GET /tools/list_areas": json(200, areasBody()) });
    const data = await queryClient.fetchQuery(areasQuery(api));
    expect(data.areas.map((a) => a.slug)).toEqual(["hitec-city", "jubilee-hills", "banjara-hills", "gachibowli"]);
    expect(new URL(net.calls[0]?.url ?? "").pathname).toBe("/tools/list_areas");
  });
});

describe("showDetailQuery", () => {
  it("reads one show by its public id", async () => {
    const { net, api, queryClient } = setup({ "GET /api/events/monsoon-theory": json(200, showDetailFixture()) });
    const show = await queryClient.fetchQuery(showDetailQuery(api, "monsoon-theory"));
    expect(show.title).toBe("The Monsoon Theory");
    expect(new URL(net.calls[0]?.url ?? "").pathname).toBe("/api/events/monsoon-theory");
  });

  it("encodes an id that is not path-safe", async () => {
    const { net, api, queryClient } = setup({ "GET /api/events/a%2Fb": json(404, { error: "not_found" }) });
    queryClient.setQueryDefaults(queryKeys.showDetail("a/b"), { retry: false });
    await expect(queryClient.fetchQuery(showDetailQuery(api, "a/b"))).rejects.toBeInstanceOf(ApiError);
    expect(new URL(net.calls[0]?.url ?? "").pathname).toBe("/api/events/a%2Fb");
  });

  it("reads a missing show as not found", async () => {
    const { api, queryClient } = setup({ "GET /api/events/gone": json(404, { error: "not_found" }) });
    queryClient.setQueryDefaults(queryKeys.showDetail("gone"), { retry: false });
    await expect(queryClient.fetchQuery(showDetailQuery(api, "gone"))).rejects.toMatchObject({ kind: "not_found", status: 404 });
  });
});
