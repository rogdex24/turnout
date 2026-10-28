import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import type { Gender } from "@turnout/contract/profile";
import { appRoutes } from "../src/app-api/routes/index.js";
import { tick } from "../src/social/tick.js";
import { PHONES, type TestApp, testApp } from "./appHelpers.js";
import { memberSession, type Session } from "./helpers/appFixture.js";
import { SHOW_START, seedShow, waitingPlan } from "./helpers/socialFixture.js";

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
  { method: "POST", pattern: "/me/delete-code", path: "/me/delete-code", auth: "member", anonymous: 401 },
  { method: "DELETE", pattern: "/me", path: "/me", auth: "member", anonymous: 401 },
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
  {
    method: "GET",
    pattern: "/groups/:groupId/messages",
    path: "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz/messages",
    auth: "member",
    anonymous: 401,
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/messages",
    path: "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz/messages",
    auth: "member",
    anonymous: 401,
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/downvotes",
    path: "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz/downvotes",
    auth: "member",
    anonymous: 401,
  },
  { method: "GET", pattern: "/me/blocked", path: "/me/blocked", auth: "member", anonymous: 401 },
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

// ---------------------------------------------------------------------------------------------------------------------------------
// The people matrix: one show, two groups, and callers who are in, out, waiting, on another show, suspended or removed.
// ---------------------------------------------------------------------------------------------------------------------------------

const HOUR = 3_600_000;
const MINUTE = 60_000;
const START = Date.parse(SHOW_START);
const GENDERS_A: Gender[] = ["woman", "man", "woman", "man", "non_binary", "woman"];
const GENDERS_B: Gender[] = ["woman", "man", "woman", "man"];

interface World {
  t: TestApp;
  groupA: string;
  groupB: string;
  groupY: string;
  a: Session[];
  b: Session[];
  /** Waiting for a group on show X: the handle is still pending, so the pool skips them. */
  waiting: Session;
  /** In a group on a different show. */
  y: Session[];
  /** Has a plan on X and a pending handle. */
  planOf: Map<string, string>;
  refOf(groupId: string, who: Session): string;
  /** Moves the clock to `ms` from the show start, runs what is due and signs the given people in again (access tokens are short). */
  at(ms: number, ...who: Session[]): Promise<void>;
}

async function world(): Promise<World> {
  const t = await testApp();
  seedShow(t.db, { id: "show-x" });
  seedShow(t.db, { id: "show-y", startsAt: "2026-11-12T14:00:00.000Z" });
  const form = async (show: string, from: number, genders: Gender[]) => {
    const people: Session[] = [];
    for (let i = 0; i < genders.length; i++) {
      const who = await memberSession(t, from + i, { name: `Person${from + i}`, gender: genders[i] });
      waitingPlan(t.db, who.memberId, show, t.clock());
      people.push(who);
    }
    tick(t.db, t.clock());
    return people;
  };
  const groupOf = (who: Session) =>
    (t.db.query("SELECT group_id FROM group_member WHERE member_id = ?").get(who.memberId) as { group_id: string }).group_id;
  const a = await form("show-x", 0, GENDERS_A);
  const b = await form("show-x", 6, GENDERS_B);
  const y = await form("show-y", 11, GENDERS_B);
  const waiting = await memberSession(t, 15, { name: "Waiting", handle: "pending" });
  waitingPlan(t.db, waiting.memberId, "show-x", t.clock());
  // The real keys are random, never derived from the member id, so a photo link cannot give an id away.
  t.db.query("UPDATE profile SET photo_key = 'photos/' || lower(hex(randomblob(12))) || '.jpg'").run();
  const planOf = new Map<string, string>();
  for (const who of [...a, ...b, ...y, waiting]) {
    planOf.set(who.memberId, (t.db.query("SELECT id FROM plan WHERE member_id = ?").get(who.memberId) as { id: string }).id);
  }
  const everyone = [...a, ...b, ...y, waiting];
  return {
    t,
    groupA: groupOf(a[0] as Session),
    groupB: groupOf(b[0] as Session),
    groupY: groupOf(y[0] as Session),
    a,
    b,
    waiting,
    y,
    planOf,
    refOf: (groupId, who) =>
      (
        t.db.query("SELECT member_ref FROM group_member WHERE group_id = ? AND member_id = ?").get(groupId, who.memberId) as {
          member_ref: string;
        }
      ).member_ref,
    at: async (ms, ...who) => {
      t.clock.set(new Date(START + ms));
      tick(t.db, t.clock());
      for (const person of who.length > 0 ? who : everyone) person.token = (await t.signIn(person.phone)).accessToken;
    },
  };
}

const statusOf = async (t: TestApp, method: string, path: string, who: Session) =>
  (await t.call(method, path, { token: who.token, body: method === "GET" ? undefined : {} })).status;

describe("authorization matrix, people and groups", () => {
  test("the world has two groups on one show and a third on another", async () => {
    const w = await world();
    expect(new Set([w.groupA, w.groupB, w.groupY]).size).toBe(3);
    expect((w.t.db.query("SELECT COUNT(*) AS n FROM group_member WHERE group_id = ?").get(w.groupA) as { n: number }).n).toBe(6);
    expect((w.t.db.query("SELECT COUNT(*) AS n FROM group_member WHERE group_id = ?").get(w.groupB) as { n: number }).n).toBe(4);
    expect(w.t.db.query("SELECT group_id FROM plan WHERE member_id = ?").get(w.waiting.memberId)).toEqual({ group_id: null });
  });

  for (const [label, offset] of [
    ["a minute before T-3h", -3 * HOUR - MINUTE],
    ["at T-3h", -3 * HOUR],
  ] as const) {
    test(`${label}: a member reaches their own group and plan and nobody else's, on every group and plan route`, async () => {
      const w = await world();
      await w.at(offset);
      const me = w.a[0] as Session;
      const mine = w.planOf.get(me.memberId) as string;
      const theirs = [w.b[0], w.y[0], w.waiting].map((who) => w.planOf.get((who as Session).memberId) as string);
      const foreignRef = w.refOf(w.groupB, w.b[1] as Session);
      expect(await statusOf(w.t, "GET", `/groups/${w.groupA}`, me)).toBe(200);
      expect(await statusOf(w.t, "GET", `/plans/${mine}`, me)).toBe(200);
      for (const group of [w.groupB, w.groupY]) {
        expect(await statusOf(w.t, "GET", `/groups/${group}`, me)).toBe(404);
        expect(await statusOf(w.t, "POST", `/groups/${group}/checkin`, me)).toBe(404);
        expect(await statusOf(w.t, "GET", `/groups/${group}/members/${foreignRef}/photo`, me)).toBe(404);
      }
      // a ref from another group is nothing in mine, at any time
      expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/members/${foreignRef}/photo`, me)).toBe(404);
      for (const plan of theirs) {
        expect(await statusOf(w.t, "GET", `/plans/${plan}`, me)).toBe(404);
        expect(await statusOf(w.t, "POST", `/plans/${plan}/withdraw`, me)).toBe(404);
        expect(await statusOf(w.t, "PUT", `/plans/${plan}/ticket`, me)).toBe(404);
      }
    });

    test(`${label}: a person outside every group gets the one 404 from each group route`, async () => {
      const w = await world();
      await w.at(offset);
      const knownRef = w.refOf(w.groupA, w.a[1] as Session);
      for (const who of [w.waiting, w.y[0] as Session, w.b[0] as Session]) {
        const own = who === w.b[0] ? w.groupB : w.groupY;
        for (const group of who === w.waiting ? [w.groupA, w.groupB, w.groupY] : [w.groupA]) {
          const answers = [
            await w.t.call("GET", `/groups/${group}`, { token: who.token }),
            await w.t.call("GET", `/groups/${group}/members/${knownRef}/photo`, { token: who.token }),
            await w.t.call("POST", `/groups/${group}/checkin`, { token: who.token, body: {} }),
          ];
          for (const response of answers) {
            expect([group, response.status]).toEqual([group, 404]);
            expect(await response.clone().json()).toEqual({ error: { code: "not_found", message: "not found" } });
          }
        }
        expect(own.length).toBeGreaterThan(0);
      }
    });
  }

  test("before T-3h the group answer, the plan, the notices and the show hold no co-member name, ref, id or photo key; from T-3h the names come but never an id", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    const others = w.a.slice(1);
    const refs = others.map((o) => w.refOf(w.groupA, o));
    const names = others.map((o) => `Person${PHONES.indexOf(o.phone)}`);
    const photoKeys = (people: Session[]) =>
      people.map(
        (o) => (w.t.db.query("SELECT photo_key FROM profile WHERE member_id = ?").get(o.memberId) as { photo_key: string }).photo_key,
      );
    const never = [...others, ...w.b].map((o) => o.memberId);
    const collect = async () => {
      const bodies: string[] = [];
      for (const path of [`/groups/${w.groupA}`, "/plans", `/plans/${w.planOf.get(me.memberId)}`, "/notices", "/me"]) {
        const response = await w.t.call("GET", path, { token: me.token });
        expect([path, response.status]).toEqual([path, 200]);
        bodies.push(await response.text());
      }
      return bodies.join("\n");
    };
    await w.at(-3 * HOUR - MINUTE, me);
    const before = await collect();
    for (const secret of [...names, ...refs, ...never, ...photoKeys([...others, ...w.b])]) expect(before).not.toContain(secret);
    expect(before).not.toContain("cafe");
    // the show is already past its join window, so it is the same 404 as a show that is not there
    expect(await statusOf(w.t, "GET", "/shows/show-x", me)).toBe(404);
    await w.at(-3 * HOUR, me);
    const after = await collect();
    expect(after).toContain(names[0] as string);
    for (const secret of [...never, ...photoKeys(w.b)]) expect(after).not.toContain(secret);
  });

  test("a member's photo route opens a co-member only from T-3h, and never one who has left", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    const ref = w.refOf(w.groupA, w.a[1] as Session);
    const gone = w.refOf(w.groupA, w.a[2] as Session);
    await w.at(-3 * HOUR - MINUTE, me);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/members/${ref}/photo`, me)).toBe(404);
    await w.at(-3 * HOUR, me);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/members/${ref}/photo`, me)).toBe(200);
    w.t.db.query("UPDATE group_member SET left_at = ? WHERE member_ref = ?").run(w.t.clock().toISOString(), gone);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/members/${gone}/photo`, me)).toBe(404);
  });

  test("a member who has left the group gets the 404 on the group, the photos and the check-in", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    const left = w.a[3] as Session;
    w.t.db.query("UPDATE group_member SET left_at = ? WHERE member_id = ?").run(w.t.clock().toISOString(), left.memberId);
    await w.at(-3 * HOUR, me, left);
    const ref = w.refOf(w.groupA, me);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}`, left)).toBe(404);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/members/${ref}/photo`, left)).toBe(404);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/checkin`, left)).toBe(404);
    // and the people still in it no longer see them
    const body = (await (await w.t.call("GET", `/groups/${w.groupA}`, { token: me.token })).json()) as { members: { memberRef: string }[] };
    expect(body.members.map((m) => m.memberRef)).not.toContain(w.refOf(w.groupA, left));
  });

  test("check-in is a 409 before T-90m and after an hour past the start, and a 200 inside the window; a caller who cannot see the group never gets the 409", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    const outsider = w.b[0] as Session;
    await w.at(-3 * HOUR, me, outsider);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/checkin`, me)).toBe(409);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/checkin`, outsider)).toBe(404);
    await w.at(-90 * MINUTE, me, outsider);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/checkin`, outsider)).toBe(404);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/checkin`, me)).toBe(200);
    await w.at(HOUR + MINUTE, me);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/checkin`, me)).toBe(409);
  });

  test("a suspended member who was in a group is 403 on every group and plan route, a banned one 401", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    await w.at(-3 * HOUR, me);
    w.t.db.query("UPDATE member SET status = 'suspended' WHERE id = ?").run(me.memberId);
    for (const [method, path] of [
      ["GET", `/groups/${w.groupA}`],
      ["POST", `/groups/${w.groupA}/checkin`],
      ["GET", `/groups/${w.groupA}/members/${w.refOf(w.groupA, w.a[1] as Session)}/photo`],
      ["GET", `/plans/${w.planOf.get(me.memberId)}`],
      ["GET", "/plans"],
    ] as const) {
      expect([path, await statusOf(w.t, method, path, me)]).toEqual([path, 403]);
    }
    w.t.db.query("UPDATE member SET status = 'banned' WHERE id = ?").run(me.memberId);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}`, me)).toBe(401);
  });

  test("the plans list and the notices list hold only the caller's own, whoever else is on the show", async () => {
    const w = await world();
    await w.at(-3 * HOUR);
    for (const who of [w.a[0] as Session, w.b[0] as Session, w.y[0] as Session, w.waiting]) {
      const plans = (await (await w.t.call("GET", "/plans", { token: who.token })).json()) as { plans: { id: string }[] };
      expect(plans.plans.map((p) => p.id)).toEqual([w.planOf.get(who.memberId) as string]);
      const notices = (await (await w.t.call("GET", "/notices", { token: who.token })).json()) as { notices: { id: string }[] };
      const mineIds = (w.t.db.query("SELECT id FROM notice WHERE member_id = ?").all(who.memberId) as { id: string }[]).map((n) => n.id);
      expect(notices.notices.map((n) => n.id).sort()).toEqual([...mineIds].sort());
    }
  });

  test("the thread: a caller outside the group gets the one 404 at any time, and a co-member only from T-3h", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    const outsiders = [w.b[0] as Session, w.y[0] as Session, w.waiting];
    const note = { body: "hello", clientId: "client-authz-1" };
    for (const [offset, mineStatus] of [
      [-3 * HOUR - MINUTE, 404],
      [-3 * HOUR, 200],
    ] as const) {
      await w.at(offset);
      expect([offset, await statusOf(w.t, "GET", `/groups/${w.groupA}/messages`, me)]).toEqual([offset, mineStatus]);
      for (const who of outsiders) {
        const read = await w.t.call("GET", `/groups/${w.groupA}/messages`, { token: who.token });
        const write = await w.t.call("POST", `/groups/${w.groupA}/messages`, { token: who.token, body: note });
        expect([read.status, write.status]).toEqual([404, 404]);
        expect(await read.json()).toEqual({ error: { code: "not_found", message: "not found" } });
      }
    }
    expect(w.t.db.query("SELECT count(*) AS n FROM message").get()).toEqual({ n: 0 });
    // a member of another group posts into theirs only
    const own = await w.t.call("POST", `/groups/${w.groupB}/messages`, { token: (w.b[0] as Session).token, body: note });
    expect(own.status).toBe(201);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/messages`, w.b[0] as Session)).toBe(404);
  });

  test("a suspended member is 403 on the thread and a banned one 401", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    await w.at(-3 * HOUR, me);
    w.t.db.query("UPDATE member SET status = 'suspended' WHERE id = ?").run(me.memberId);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/messages`, me)).toBe(403);
    expect(await statusOf(w.t, "POST", `/groups/${w.groupA}/messages`, me)).toBe(403);
    w.t.db.query("UPDATE member SET status = 'banned' WHERE id = ?").run(me.memberId);
    expect(await statusOf(w.t, "GET", `/groups/${w.groupA}/messages`, me)).toBe(401);
  });
});

describe("authorization matrix, feedback", () => {
  const downvoteAs = (w: World, who: Session, groupId: string, memberRef: string) =>
    w.t.call("POST", `/groups/${groupId}/downvotes`, { token: who.token, body: { memberRef } });

  test("only a current member of a done group can mark someone in it, and a ref from another group is the one 404", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    await w.at(15 * HOUR);
    const target = w.refOf(w.groupA, w.a[1] as Session);
    for (const who of [w.b[0] as Session, w.y[0] as Session, w.waiting]) {
      expect((await downvoteAs(w, who, w.groupA, target)).status).toBe(404);
    }
    expect((await downvoteAs(w, me, w.groupA, w.refOf(w.groupB, w.b[1] as Session))).status).toBe(404);
    expect((await downvoteAs(w, me, w.groupB, w.refOf(w.groupB, w.b[1] as Session))).status).toBe(404);
    expect(w.t.db.query("SELECT count(*) AS n FROM downvote").get()).toEqual({ n: 0 });
    expect((await downvoteAs(w, me, w.groupA, target)).status).toBe(204);
  });

  test("a suspended member is 403 and a banned one 401 on both routes", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    await w.at(15 * HOUR, me);
    const target = w.refOf(w.groupA, w.a[1] as Session);
    w.t.db.query("UPDATE member SET status = 'suspended' WHERE id = ?").run(me.memberId);
    expect((await downvoteAs(w, me, w.groupA, target)).status).toBe(403);
    expect(await statusOf(w.t, "GET", "/me/blocked", me)).toBe(403);
    w.t.db.query("UPDATE member SET status = 'banned' WHERE id = ?").run(me.memberId);
    expect((await downvoteAs(w, me, w.groupA, target)).status).toBe(401);
    expect(await statusOf(w.t, "GET", "/me/blocked", me)).toBe(401);
  });

  test("a stopped member can still read their own blocked list", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    await w.at(15 * HOUR, me);
    w.t.db.query("UPDATE member SET status = 'stopped' WHERE id = ?").run(me.memberId);
    expect(await statusOf(w.t, "GET", "/me/blocked", me)).toBe(200);
  });
});
