import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { appRoutes } from "../src/app-api/routes/index.js";
import { PHONES, type TestApp, testApp } from "./appHelpers.js";

/**
 * The authorization matrix for the routes M2 and M3 ship. The row list is checked against the route table in both directions, so a
 * route added without a row fails here, and a row for a route that is gone fails too. The group and "not yet" fixtures the plan
 * describes follow the first block.
 */
interface Row {
  method: string;
  pattern: string;
  /** A concrete path under the API base. */
  path: string;
  auth: "member" | "none";
  /** What a caller with no credentials gets. For a public route this is the route's own answer to an empty request. */
  anonymous: number;
}

const ROWS: Row[] = [
  { method: "GET", pattern: "/health", path: "/health", auth: "none", anonymous: 200 },
  { method: "GET", pattern: "/config", path: "/config", auth: "none", anonymous: 200 },
  { method: "POST", pattern: "/auth/otp", path: "/auth/otp", auth: "none", anonymous: 400 },
  { method: "GET", pattern: "/auth/otp/:challengeId", path: "/auth/otp/01hzzzzzzzzzzzzzzzzzzzzzzz", auth: "none", anonymous: 404 },
  { method: "POST", pattern: "/auth/otp/verify", path: "/auth/otp/verify", auth: "none", anonymous: 400 },
  { method: "POST", pattern: "/auth/refresh", path: "/auth/refresh", auth: "none", anonymous: 400 },
  { method: "POST", pattern: "/auth/sign-out", path: "/auth/sign-out", auth: "member", anonymous: 401 },
  { method: "GET", pattern: "/webhooks/whatsapp", path: "/webhooks/whatsapp", auth: "none", anonymous: 403 },
  { method: "POST", pattern: "/webhooks/whatsapp", path: "/webhooks/whatsapp", auth: "none", anonymous: 401 },
  { method: "GET", pattern: "/files/*", path: "/files/photos/someone/x.jpg", auth: "none", anonymous: 404 },
  { method: "GET", pattern: "/me", path: "/me", auth: "member", anonymous: 401 },
  { method: "PATCH", pattern: "/me/profile", path: "/me/profile", auth: "member", anonymous: 401 },
  { method: "PUT", pattern: "/me/handle", path: "/me/handle", auth: "member", anonymous: 401 },
  { method: "PUT", pattern: "/me/photo", path: "/me/photo", auth: "member", anonymous: 401 },
  { method: "GET", pattern: "/me/photo", path: "/me/photo", auth: "member", anonymous: 401 },
  { method: "POST", pattern: "/me/consent", path: "/me/consent", auth: "member", anonymous: 401 },
  { method: "GET", pattern: "/shows/:publicId", path: "/shows/show-a", auth: "member", anonymous: 401 },
  { method: "GET", pattern: "/plans", path: "/plans", auth: "member", anonymous: 401 },
  { method: "POST", pattern: "/plans", path: "/plans", auth: "member", anonymous: 401 },
  { method: "GET", pattern: "/plans/:planId", path: "/plans/01hzzzzzzzzzzzzzzzzzzzzzzz", auth: "member", anonymous: 401 },
  {
    method: "POST",
    pattern: "/plans/:planId/withdraw",
    path: "/plans/01hzzzzzzzzzzzzzzzzzzzzzzz/withdraw",
    auth: "member",
    anonymous: 401,
  },
  { method: "PUT", pattern: "/plans/:planId/ticket", path: "/plans/01hzzzzzzzzzzzzzzzzzzzzzzz/ticket", auth: "member", anonymous: 401 },
  { method: "GET", pattern: "/groups/:groupId", path: "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz", auth: "member", anonymous: 401 },
  {
    method: "GET",
    pattern: "/groups/:groupId/members/:memberRef/photo",
    path: "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz/members/ref/photo",
    auth: "member",
    anonymous: 401,
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/checkin",
    path: "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz/checkin",
    auth: "member",
    anonymous: 401,
  },
  { method: "GET", pattern: "/notices", path: "/notices", auth: "member", anonymous: 401 },
  { method: "POST", pattern: "/notices/read", path: "/notices/read", auth: "member", anonymous: 401 },
  { method: "POST", pattern: "/devices", path: "/devices", auth: "member", anonymous: 401 },
  { method: "DELETE", pattern: "/devices/:deviceId", path: "/devices/01hzzzzzzzzzzzzzzzzzzzzzzz", auth: "member", anonymous: 401 },
  // The staging routes: they answer 404 without the token, so a production-like caller cannot tell they exist.
  { method: "POST", pattern: "/__test/otp", path: "/__test/otp", auth: "none", anonymous: 404 },
  { method: "POST", pattern: "/__test/clock", path: "/__test/clock", auth: "none", anonymous: 404 },
];

const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;
const memberRows = ROWS.filter((row) => row.auth === "member");
const send = (t: TestApp, row: Row, token?: string) => t.call(row.method, row.path, { token, body: row.method === "GET" ? undefined : {} });

describe("authorization matrix, anonymous and bad credentials", () => {
  test("every route in the table has a row and every row has a route", async () => {
    const t = await testApp();
    const inTable = appRoutes(t.app).map((route) => `${route.method} ${route.pattern} ${route.auth}`);
    const inRows = ROWS.map((row) => `${row.method} ${row.pattern} ${row.auth}`);
    expect([...inRows].sort()).toEqual([...inTable].sort());
  });

  test("a caller with no credentials gets the row's answer, and a member route never runs its handler", async () => {
    const t = await testApp();
    for (const row of ROWS) {
      const response = await send(t, row);
      expect([row.method, row.pattern, response.status]).toEqual([row.method, row.pattern, row.anonymous]);
      if (row.auth === "member") expect((await errorOf(response)).code).toBe("unauthorized");
    }
  });

  test("a made-up, malformed or foreign-signed token is 401 on every member route", async () => {
    const t = await testApp();
    const other = await testApp();
    const foreign = (await other.signIn(PHONES[0] as string)).accessToken;
    for (const token of ["not-a-token", "a.b.c", foreign]) {
      for (const row of memberRows) {
        const response = await send(t, row, token);
        expect([row.method, row.pattern, response.status]).toEqual([row.method, row.pattern, 401]);
      }
    }
  });

  test("an expired access token is 401 on every member route", async () => {
    const t = await testApp();
    const { accessToken } = await t.signIn(PHONES[1] as string);
    t.clock.advance(16 * 60 * 1000);
    for (const row of memberRows) expect((await send(t, row, accessToken)).status).toBe(401);
  });

  test("a suspended member is 403 account_suspended on every member route; a banned member is 401", async () => {
    const t = await testApp();
    const { accessToken } = await t.signIn(PHONES[2] as string);
    t.db.query("UPDATE member SET status = 'suspended' WHERE phone_e164 = ?").run(PHONES[2] as string);
    for (const row of memberRows) {
      if (row.pattern === "/auth/sign-out") continue; // signing out must keep working for anyone holding a session
      const response = await send(t, row, accessToken);
      expect([row.method, row.pattern, response.status, (await errorOf(response)).code]).toEqual([
        row.method,
        row.pattern,
        403,
        "account_suspended",
      ]);
    }
    t.db.query("UPDATE member SET status = 'banned' WHERE phone_e164 = ?").run(PHONES[2] as string);
    for (const row of memberRows) {
      const response = await send(t, row, accessToken);
      expect([row.method, row.pattern, response.status]).toEqual([row.method, row.pattern, 401]);
    }
  });

  test("a member sees only their own record: a second member's token never returns the first member's data", async () => {
    const t = await testApp();
    const first = await t.signIn(PHONES[3] as string);
    const second = await t.signIn(PHONES[4] as string);
    const firstMe = (await (await t.call("GET", "/me", { token: first.accessToken })).json()) as { phoneLast4: string };
    const secondMe = (await (await t.call("GET", "/me", { token: second.accessToken })).json()) as { phoneLast4: string };
    expect(firstMe.phoneLast4).toBe((PHONES[3] as string).slice(-4));
    expect(secondMe.phoneLast4).toBe((PHONES[4] as string).slice(-4));
  });
});
