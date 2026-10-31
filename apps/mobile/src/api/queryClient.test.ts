import { onlineManager } from "@tanstack/react-query";
import { offlineError } from "../model/apiError";
import { createConnectivity } from "./connectivity";
import { queryKeys } from "./keys";
import { followConnectivity, shouldRetry } from "./queryClient";
import { clearTestClients, testQueryClient } from "./testing";

afterEach(() => clearTestClients());

describe("retry", () => {
  it("retries offline and server failures twice, and nothing else", () => {
    expect(shouldRetry(0, offlineError())).toBe(true);
    expect(shouldRetry(1, offlineError())).toBe(true);
    expect(shouldRetry(2, offlineError())).toBe(false);
    expect(shouldRetry(0, new Error("boom"))).toBe(false);
  });
});

describe("defaults", () => {
  it("applies the stale time by key", () => {
    const client = testQueryClient();
    expect(client.getQueryDefaults(queryKeys.config()).staleTime).toBe(3_600_000);
    expect(client.getQueryDefaults(queryKeys.thread("g")).staleTime).toBe(0);
  });
});

describe("followConnectivity", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("pauses when a call fails and resumes when one answers", () => {
    const connectivity = createConnectivity();
    const stop = followConnectivity(connectivity, testQueryClient());
    connectivity.report(false);
    expect(onlineManager.isOnline()).toBe(false);
    connectivity.report(true);
    expect(onlineManager.isOnline()).toBe(true);
    stop();
    connectivity.report(false);
    expect(onlineManager.isOnline()).toBe(true);
  });

  // offline-home on a device: after one failed call the client said offline, a pull to refresh sent nothing, and the bar never went.
  it("still sends a refresh while offline, so the first answer can bring the app back online", async () => {
    const connectivity = createConnectivity();
    const client = testQueryClient();
    const stop = followConnectivity(connectivity, client);
    connectivity.report(false);
    let calls = 0;
    const data = await client.fetchQuery({
      queryKey: ["shows", "list", "probe"],
      queryFn: () => {
        calls += 1;
        connectivity.report(true);
        return "answer";
      },
    });
    expect(data).toBe("answer");
    expect(calls).toBe(1);
    expect(onlineManager.isOnline()).toBe(true);
    stop();
  });
});
