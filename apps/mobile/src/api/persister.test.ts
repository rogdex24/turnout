import { dehydrate, MutationObserver, type QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { queryKeys } from "./keys";
import { CACHE_STORE_KEY, cacheBuster, createCachePersister, dehydrateOptions, trimForDisk } from "./persister";
import { memoryKv } from "./prefs";
import { clearTestClients, testQueryClient } from "./testing";

afterEach(() => clearTestClients());

function snapshot(client: QueryClient): PersistedClient {
  return { timestamp: 1, buster: "1.0.0:u1", clientState: dehydrate(client, dehydrateOptions) };
}

describe("dehydrate allowlist", () => {
  it("keeps the allowlisted queries and drops the rest", () => {
    const client = testQueryClient();
    client.setQueryData(queryKeys.me(), { id: "u1" });
    client.setQueryData(queryKeys.areas(), ["Bandra"]);
    client.setQueryData(queryKeys.showDetail("abc"), { title: "x" });
    client.setQueryData(queryKeys.thread("g1"), [{ text: "a private message" }]);
    client.setQueryData(queryKeys.blocked(), ["u9"]);
    const keys = snapshot(client).clientState.queries.map((query) => query.queryKey[0]);
    expect(keys.sort()).toEqual(["areas", "me"]);
  });

  it("never writes a private thread message to disk", () => {
    const client = testQueryClient();
    client.setQueryData(queryKeys.thread("g1"), [{ text: "a private message" }]);
    expect(JSON.stringify(snapshot(client))).not.toContain("a private message");
  });

  it("does not keep a query that failed", async () => {
    const client = testQueryClient();
    await client.prefetchQuery({ queryKey: queryKeys.config(), queryFn: () => Promise.reject(new Error("no")), retry: false });
    expect(snapshot(client).clientState.queries).toHaveLength(0);
  });
});

describe("shows list on disk", () => {
  it("keeps the first page only", () => {
    const client = testQueryClient();
    client.setQueryData(queryKeys.showsList("Bandra"), {
      pages: [{ items: [1] }, { items: [2] }, { items: [3] }],
      pageParams: [null, "c1", "c2"],
    });
    const trimmed = trimForDisk(snapshot(client));
    const [query] = trimmed.clientState.queries;
    expect(query?.state.data).toEqual({ pages: [{ items: [1] }], pageParams: [null] });
  });

  it("leaves other queries alone", () => {
    const client = testQueryClient();
    client.setQueryData(queryKeys.areas(), ["a", "b"]);
    const trimmed = trimForDisk(snapshot(client));
    expect(trimmed.clientState.queries[0]?.state.data).toEqual(["a", "b"]);
  });
});

describe("cache persister", () => {
  afterEach(() => jest.useRealTimers());

  it("writes after the throttle and reads it back", () => {
    jest.useFakeTimers();
    const store = memoryKv();
    const persister = createCachePersister(store, { throttleMs: 1000 });
    const client = testQueryClient();
    client.setQueryData(queryKeys.areas(), ["Bandra"]);
    void persister.persistClient(snapshot(client));
    expect(store.getString(CACHE_STORE_KEY)).toBeUndefined();
    jest.advanceTimersByTime(1000);
    const restored = persister.restoreClient() as PersistedClient;
    expect(restored.buster).toBe("1.0.0:u1");
    expect(restored.clientState.queries[0]?.queryKey).toEqual(["areas"]);
  });

  it("stamps each write with the buster of the moment, so a sign-in during the run is kept", () => {
    jest.useFakeTimers();
    const store = memoryKv();
    let buster = cacheBuster("1.0.0", null);
    const persister = createCachePersister(store, { throttleMs: 1000, buster: () => buster });
    const client = testQueryClient();
    client.setQueryData(queryKeys.areas(), ["Bandra"]);
    buster = cacheBuster("1.0.0", "u2");
    void persister.persistClient(snapshot(client));
    jest.advanceTimersByTime(1000);
    expect((persister.restoreClient() as PersistedClient).buster).toBe("1.0.0:u2");
  });

  it("writes the last state only", () => {
    jest.useFakeTimers();
    const store = memoryKv();
    const persister = createCachePersister(store, { throttleMs: 1000 });
    const client = testQueryClient();
    client.setQueryData(queryKeys.areas(), ["first"]);
    void persister.persistClient(snapshot(client));
    client.setQueryData(queryKeys.areas(), ["second"]);
    void persister.persistClient(snapshot(client));
    jest.advanceTimersByTime(1000);
    expect(store.getString(CACHE_STORE_KEY)).toContain("second");
    expect(store.getString(CACHE_STORE_KEY)).not.toContain("first");
  });

  it("removes the cache and cancels a pending write on sign-out", () => {
    jest.useFakeTimers();
    const store = memoryKv();
    const persister = createCachePersister(store, { throttleMs: 1000 });
    void persister.persistClient(snapshot(testQueryClient()));
    void persister.removeClient();
    jest.advanceTimersByTime(5000);
    expect(store.getString(CACHE_STORE_KEY)).toBeUndefined();
  });

  it("drops a cache it cannot read", () => {
    const store = memoryKv();
    store.set(CACHE_STORE_KEY, "{not json");
    expect(createCachePersister(store).restoreClient()).toBeUndefined();
    expect(store.getString(CACHE_STORE_KEY)).toBeUndefined();
  });
});

describe("buster", () => {
  it("changes with the app version and with the person", () => {
    expect(cacheBuster("1.0.0", "u1")).not.toBe(cacheBuster("1.0.1", "u1"));
    expect(cacheBuster("1.0.0", "u1")).not.toBe(cacheBuster("1.0.0", "u2"));
    expect(cacheBuster("1.0.0", null)).toBe("1.0.0:none");
  });
});

describe("queued mutations", () => {
  it("keeps a paused replayable mutation and drops other mutations", () => {
    const client = testQueryClient();
    const make = (name: string) =>
      new MutationObserver<unknown, Error, unknown>(client, {
        mutationKey: [name],
        mutationFn: () => new Promise(() => {}),
        networkMode: "online",
      });
    const offlineFlag = jest.spyOn(require("@tanstack/react-query").onlineManager, "isOnline").mockReturnValue(false);
    void make("checkin").mutate({ clientId: "c1", payload: {} });
    void make("something-else").mutate({ clientId: "c2", payload: {} });
    const names = snapshot(client).clientState.mutations.map((mutation) => mutation.mutationKey?.[0]);
    offlineFlag.mockRestore();
    expect(names).toEqual(["checkin"]);
  });
});
