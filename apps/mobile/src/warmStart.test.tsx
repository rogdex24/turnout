import { dehydrate } from "@tanstack/react-query";
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import { queryKeys } from "@/api/keys";
import { CACHE_STORE_KEY, dehydrateOptions } from "@/api/persister";
import { memoryKv } from "@/api/prefs";
import { areasBody, eventPage, SHOWS } from "@/api/showFixtures";
import { clearTestClients, testQueryClient } from "@/api/testing";
import { releaseSplash } from "@/providers/splash";
import { createTestApp, meFixture, TEST_USER, type TestApp } from "@/providers/testing";
import { SAMPLE_CONFIG } from "@/screens/notice/fixtures";

// Same set-up as the router tests: no native splash, in-memory stores, and the real wiring in between.
jest.mock("@/providers/splash", () => ({ holdSplash: jest.fn(), releaseSplash: jest.fn() }));
jest.setTimeout(30_000);
let mockApp: TestApp;
jest.mock("@/providers/boot", () => ({ bootApp: () => Promise.resolve(mockApp.deps) }));

/** A request that is sent and never answered: the phone has a signal bar and no data. */
const hangs = () => new Promise<never>(() => {});
const TWO_HOURS = 2 * 60 * 60 * 1000;

/** What the last run left on disk: Home's answers, old enough that every one of them is stale and asked for again. */
function lastRunsDisk() {
  const store = memoryKv();
  const client = testQueryClient();
  const updatedAt = Date.now() - TWO_HOURS;
  client.setQueryData(queryKeys.me(), meFixture(), { updatedAt });
  client.setQueryData(queryKeys.config(), SAMPLE_CONFIG, { updatedAt });
  client.setQueryData(queryKeys.areas(), areasBody(), { updatedAt });
  client.setQueryData(queryKeys.plansList(), { plans: [] }, { updatedAt });
  client.setQueryData(queryKeys.showsList(null), { pages: [eventPage(SHOWS)], pageParams: [null] }, { updatedAt });
  const clientState = dehydrate(client, dehydrateOptions);
  store.set(CACHE_STORE_KEY, JSON.stringify({ timestamp: Date.now(), buster: `0.0.0-test:${TEST_USER}`, clientState }));
  return store;
}

afterEach(clearTestClients);

describe("a warm start", () => {
  test("Home shows the shows from the disk cache while every request is still unanswered", async () => {
    const cacheStore = lastRunsDisk();
    mockApp = await createTestApp({
      me: meFixture(),
      cacheStore,
      routes: {
        "GET /me": hangs,
        "GET /config": hangs,
        "GET /plans": hangs,
        "GET /api/events": hangs,
        "GET /tools/list_areas": hangs,
      },
    });

    await renderRouter("./src/app", { initialUrl: "/" });

    expect(await screen.findByTestId(`show-card-${SHOWS[0]?.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId("home")).toBeOnTheScreen();
    expect(releaseSplash).toHaveBeenCalled();
    // The stale answers were asked for again, behind the screen, and none has come back.
    await waitFor(() => expect(mockApp.transport.callsTo("GET /api/events").length).toBeGreaterThan(0));
    expect(mockApp.queryClient.isFetching({ queryKey: queryKeys.showsList(null) })).toBe(1);
  });

  test("a different member's disk cache is not shown", async () => {
    const cacheStore = lastRunsDisk();
    const stored = JSON.parse(cacheStore.getString(CACHE_STORE_KEY) ?? "{}");
    cacheStore.set(CACHE_STORE_KEY, JSON.stringify({ ...stored, buster: "0.0.0-test:someone-else" }));
    mockApp = await createTestApp({
      me: meFixture(),
      cacheStore,
      routes: { "GET /api/events": hangs, "GET /tools/list_areas": hangs },
    });

    await renderRouter("./src/app", { initialUrl: "/" });

    await screen.findByTestId("home");
    expect(screen.queryByTestId(`show-card-${SHOWS[0]?.id}`)).not.toBeOnTheScreen();
  });
});
