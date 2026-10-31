import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { containsInOrder, createPosthogSink, E2E_POSTHOG_KEY } from "../src/app-api/posthogSink.js";
import { appRoutes } from "../src/app-api/routes/index.js";
import { TEST_TOKEN, type TestApp, testApp } from "./appHelpers.js";

const header = { "x-staging-test-token": TEST_TOKEN };
const now = new Date("2026-10-27T06:00:00Z");
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** The post the PostHog SDK makes: `{ api_key, batch, sent_at }` with the SDK's own properties beside the app's. */
const batch = (events: { event: string; properties?: Record<string, unknown> }[], key: string = E2E_POSTHOG_KEY) => ({
  api_key: key,
  batch: events.map((item) => ({
    ...item,
    properties: { $lib: "posthog-react-native", distinct_id: "d-1", token: key, ...item.properties },
  })),
  sent_at: "2026-10-27T06:00:01Z",
});

describe("containsInOrder", () => {
  test("allows other names between, and wants the order", () => {
    expect(
      containsInOrder(
        ["a", "show_viewed", "b", "go_tapped", "show_viewed", "im_here_tapped"],
        ["show_viewed", "go_tapped", "im_here_tapped"],
      ),
    ).toBe(true);
    expect(containsInOrder(["go_tapped", "show_viewed"], ["show_viewed", "go_tapped"])).toBe(false);
    expect(containsInOrder(["show_viewed"], ["show_viewed", "go_tapped"])).toBe(false);
    expect(containsInOrder([], [])).toBe(true);
  });
});

describe("the capture sink", () => {
  test("keeps each event's name and the app's own properties, not the SDK's or the person's id", () => {
    const sink = createPosthogSink();
    const count = sink.ingest(
      encode(
        batch([
          { event: "show_viewed", properties: { show_id: "seed-show-t2d" } },
          { event: "go_tapped", properties: { show_id: "s", groups_enabled: true } },
        ]),
      ),
      null,
      now,
    );
    expect(count).toBe(2);
    expect(sink.events()).toEqual([
      { event: "show_viewed", properties: { show_id: "seed-show-t2d" }, at: now.toISOString() },
      { event: "go_tapped", properties: { show_id: "s", groups_enabled: true }, at: now.toISOString() },
    ]);
  });

  test("reads a gzip post, by the header or by the gzip magic bytes", () => {
    const sink = createPosthogSink();
    const zipped = gzipSync(encode(batch([{ event: "app_opened" }])));
    expect(sink.ingest(zipped, "gzip", now)).toBe(1);
    expect(sink.ingest(zipped, null, now)).toBe(1);
    expect(sink.events().map((item) => item.event)).toEqual(["app_opened", "app_opened"]);
  });

  test("reads a single capture, which carries the key as properties.token", () => {
    const sink = createPosthogSink();
    sink.ingest(encode({ event: "buy_tapped", properties: { token: E2E_POSTHOG_KEY, show_id: "x" } }), null, now);
    expect(sink.events()).toHaveLength(1);
    expect(sink.events()[0]?.properties).toEqual({ show_id: "x" });
  });

  test("a post with another key, or none, is a 404 and keeps nothing", () => {
    const sink = createPosthogSink();
    expect(() => sink.ingest(encode(batch([{ event: "app_opened" }], "phc_someone_elses_project")), null, now)).toThrow();
    expect(() => sink.ingest(encode({ batch: [{ event: "app_opened" }] }), null, now)).toThrow();
    expect(sink.events()).toEqual([]);
  });

  test("a body that is not JSON, not an object or a broken gzip stream is refused", () => {
    const sink = createPosthogSink();
    for (const body of [new TextEncoder().encode("nope"), encode([1, 2]), new Uint8Array([0x1f, 0x8b, 1, 2, 3])]) {
      expect(() => sink.ingest(body, null, now)).toThrow();
    }
  });

  test("an unzipped body over the limit is refused", () => {
    const sink = createPosthogSink();
    const big = gzipSync(encode(batch([{ event: "x", properties: { text: "a".repeat(300 * 1024) } }])));
    expect(() => sink.ingest(big, "gzip", now)).toThrow();
  });

  test("keeps only the newest 500 events", () => {
    const sink = createPosthogSink();
    const events = Array.from({ length: 600 }, (_, index) => ({ event: `e${index}` }));
    sink.ingest(encode(batch(events)), null, now);
    expect(sink.events()).toHaveLength(500);
    expect(sink.events()[0]?.event).toBe("e100");
  });

  test("waitFor answers at once when the events are there, and when they arrive later, and times out when they do not", async () => {
    const sink = createPosthogSink();
    sink.ingest(encode(batch([{ event: "show_viewed" }])), null, now);
    expect((await sink.waitFor(["show_viewed"], 1000)).matched).toBe(true);

    const pending = sink.waitFor(["show_viewed", "go_tapped"], 2000);
    setTimeout(() => sink.ingest(encode(batch([{ event: "go_tapped" }])), null, now), 20);
    const late = await pending;
    expect(late.matched).toBe(true);
    expect(late.events.map((item) => item.event)).toEqual(["show_viewed", "go_tapped"]);

    const missed = await sink.waitFor(["im_here_tapped"], 30);
    expect(missed.matched).toBe(false);
    expect(missed.events).toHaveLength(2);
  });
});

describe("the capture routes", () => {
  const post = (t: TestApp, name: string, body: unknown, headers: Record<string, string> = {}) =>
    t.call("POST", `/__test/posthog/${name}`, { rawBody: body as Uint8Array, headers });
  const read = (t: TestApp, query = "") => t.call("GET", `/__test/posthog/events${query}`, { headers: header });

  test("the SDK's path, /batch/ with a trailing slash, takes a gzip post without the test token, and the read needs the token", async () => {
    const t = await testApp();
    const body = gzipSync(encode(batch([{ event: "show_viewed", properties: { show_id: "seed-show-t2d" } }])));
    const sent = await post(t, "batch/", body, { "content-encoding": "gzip", "content-type": "application/json" });
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ status: 1 });

    expect((await t.call("GET", "/__test/posthog/events")).status).toBe(404);
    expect((await t.call("GET", "/__test/posthog/events", { headers: { "x-staging-test-token": "wrong" } })).status).toBe(404);
    const events = (await (await read(t)).json()) as { events: { event: string }[]; matched: boolean };
    expect(events.events.map((item) => item.event)).toEqual(["show_viewed"]);
    expect(events.matched).toBe(true);
  });

  test("a post with a wrong key is 404 and a malformed one is 400", async () => {
    const t = await testApp();
    expect((await post(t, "batch", encode(batch([{ event: "x" }], "phc_other")))).status).toBe(404);
    expect((await post(t, "batch", new TextEncoder().encode("nope"))).status).toBe(400);
    expect(((await (await read(t)).json()) as { events: unknown[] }).events).toEqual([]);
  });

  test("a body over the limit is 413", async () => {
    const t = await testApp();
    expect((await post(t, "batch", new Uint8Array(300 * 1024))).status).toBe(413);
  });

  test("until and waitMs hold the read open for events that come later, up to a cap", async () => {
    const t = await testApp();
    const wait = read(t, "?until=show_viewed,go_tapped&waitMs=3000");
    setTimeout(() => void post(t, "batch", encode(batch([{ event: "show_viewed" }, { event: "go_tapped" }]))), 30);
    expect(((await (await wait).json()) as { matched: boolean }).matched).toBe(true);
    const none = (await (await read(t, "?until=im_here_tapped&waitMs=20")).json()) as { matched: boolean };
    expect(none.matched).toBe(false);
  });

  test("reset empties what was kept, and needs the token", async () => {
    const t = await testApp();
    await post(t, "batch", encode(batch([{ event: "app_opened" }])));
    expect((await t.call("POST", "/__test/posthog/reset", { body: {} })).status).toBe(404);
    expect((await t.call("POST", "/__test/posthog/reset", { body: {}, headers: header })).status).toBe(200);
    expect(((await (await read(t)).json()) as { events: unknown[] }).events).toEqual([]);
  });

  test("each server keeps its own events", async () => {
    const one = await testApp();
    const two = await testApp();
    await post(one, "batch", encode(batch([{ event: "app_opened" }])));
    expect(((await (await read(two)).json()) as { events: unknown[] }).events).toEqual([]);
  });

  test("production and a server with no test token have no capture routes", async () => {
    const t = await testApp();
    const asProduction = { ...t.app, config: { ...t.app.config, env: "production" as const } };
    expect(appRoutes(t.app).some((route) => route.pattern.startsWith("/__test/posthog/"))).toBe(true);
    expect(appRoutes(asProduction).some((route) => route.pattern.startsWith("/__test/posthog/"))).toBe(false);
    const none = await testApp({ env: { STAGING_TEST_TOKEN: "" } });
    expect((await post(none, "batch", encode(batch([{ event: "app_opened" }])))).status).toBe(404);
  });

  test("the e2e build is given the key the sink takes", async () => {
    const env = await Bun.file(`${import.meta.dir}/../apps/mobile/ci/env.sh`).text();
    expect(env).toContain(`export EXPO_PUBLIC_POSTHOG_KEY=${E2E_POSTHOG_KEY}\n`);
    expect(env).toContain("export EXPO_PUBLIC_POSTHOG_HOST=/api/app/v1/__test/posthog\n");
  });
});
