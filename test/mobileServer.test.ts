import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import { type MobileServer, startMobileServer } from "../e2e/mobile-server.js";

let server: MobileServer | undefined;
afterAll(async () => {
  await server?.stop();
});

test("the mobile server starts serve on a seeded temp database and answers /api/events", async () => {
  server = await startMobileServer();
  expect(server.url).toBe(`http://localhost:${server.port}`);
  const response = await fetch(`${server.url}/api/events?limit=100`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { events?: Array<{ title: string }> } | Array<{ title: string }>;
  const events = Array.isArray(body) ? body : (body.events ?? []);
  // The fixture seeds 13 events, all upcoming on the real clock.
  expect(events.length).toBeGreaterThan(0);
  expect(events.some((e) => e.title === "Jazz night")).toBe(true);
}, 90_000);

test("stop removes the temp database", async () => {
  const other = await startMobileServer();
  expect(fs.existsSync(other.dbPath)).toBe(true);
  await other.stop();
  expect(fs.existsSync(other.dbPath)).toBe(false);
}, 90_000);
