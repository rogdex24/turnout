import { QueryObserver } from "@tanstack/react-query";
import type { ApiClient } from "./client";
import { AFTER_GC_MS, afterQuery } from "./feedback";
import { groupFixture } from "./groupFixtures";
import { queryKeys } from "./keys";
import { createAppQueryClient } from "./queryClient";

describe("afterQuery", () => {
  afterEach(() => jest.useRealTimers());

  it("lets go of the faces five minutes after the last screen that reads them has gone", async () => {
    jest.useFakeTimers();
    const api = { request: jest.fn().mockResolvedValue(groupFixture()) } as unknown as ApiClient;
    const client = createAppQueryClient();
    const unsubscribe = new QueryObserver(client, afterQuery(api, "g1")).subscribe(() => undefined);
    await jest.advanceTimersByTimeAsync(0);
    expect(client.getQueryData(queryKeys.after("g1"))).toBeDefined();
    unsubscribe();
    await jest.advanceTimersByTimeAsync(AFTER_GC_MS - 1);
    expect(client.getQueryData(queryKeys.after("g1"))).toBeDefined();
    await jest.advanceTimersByTimeAsync(2);
    expect(client.getQueryData(queryKeys.after("g1"))).toBeUndefined();
  });
});
