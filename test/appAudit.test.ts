import { describe, expect, test } from "bun:test";
import { appRoutes } from "../src/app-api/routes/index.js";
import { PHONES } from "./appHelpers.js";
import type { Session } from "./helpers/appFixture.js";
import { HOUR, MINUTE, type World, world } from "./helpers/groupWorld.js";

/**
 * The S19 audit. Two properties of the member routes, each with a test that fails when the guard behind it is removed:
 *
 * 1. Every route that takes an id from the caller refuses another member's id with the same 404 it gives an id that does not exist,
 *    while the caller's own id is not a 404. A route that dropped its owner or membership check would answer the foreign id like
 *    the own one, and the row for it fails. The table is checked against the route table, so a new id route needs a row.
 * 2. No response, at any time from before the reveal to after the thread is gone, and no log line, carries a co-member's member id,
 *    phone, handle or gender, or the photo of someone who is not in the caller's group.
 */

const NOT_FOUND = { error: { code: "not_found", message: "not found" } };
const MISSING = "01hzzzzzzzzzzzzzzzzzzzzzzz";

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

interface Triple {
  own: Call;
  foreign: Call;
  missing: Call;
}

interface IdRow {
  method: string;
  pattern: string;
  /** Milliseconds from the show start at which the caller's own id is not a 404. */
  at: number;
  /** The same request with the caller's own ids, another member's ids, and ids that are nowhere. */
  calls(w: World, me: Session): Promise<Triple> | Triple;
}

const note = (n: number) => ({ body: "hello", clientId: `client-audit-${n}` });

/** One row per member route that takes an id in its path or its body. */
const ID_ROWS: IdRow[] = [
  {
    method: "GET",
    pattern: "/plans/:planId",
    at: -3 * HOUR,
    calls: (w, me) => ({
      own: { method: "GET", path: `/plans/${w.planOf.get(me.memberId)}` },
      foreign: { method: "GET", path: `/plans/${w.planOf.get((w.b[0] as Session).memberId)}` },
      missing: { method: "GET", path: `/plans/${MISSING}` },
    }),
  },
  {
    method: "POST",
    pattern: "/plans/:planId/withdraw",
    at: -3 * HOUR,
    calls: (w, me) => ({
      own: { method: "POST", path: `/plans/${w.planOf.get(me.memberId)}/withdraw`, body: {} },
      foreign: { method: "POST", path: `/plans/${w.planOf.get((w.b[0] as Session).memberId)}/withdraw`, body: {} },
      missing: { method: "POST", path: `/plans/${MISSING}/withdraw`, body: {} },
    }),
  },
  {
    method: "PUT",
    pattern: "/plans/:planId/ticket",
    at: -3 * HOUR,
    calls: (w, me) => ({
      own: { method: "PUT", path: `/plans/${w.planOf.get(me.memberId)}/ticket`, body: {} },
      foreign: { method: "PUT", path: `/plans/${w.planOf.get((w.b[0] as Session).memberId)}/ticket`, body: {} },
      missing: { method: "PUT", path: `/plans/${MISSING}/ticket`, body: {} },
    }),
  },
  {
    method: "GET",
    pattern: "/groups/:groupId",
    at: -3 * HOUR,
    calls: (w) => ({
      own: { method: "GET", path: `/groups/${w.groupA}` },
      foreign: { method: "GET", path: `/groups/${w.groupB}` },
      missing: { method: "GET", path: `/groups/${MISSING}` },
    }),
  },
  {
    method: "GET",
    pattern: "/groups/:groupId/members/:memberRef/photo",
    at: -3 * HOUR,
    calls: (w) => {
      const ref = w.refOf(w.groupA, w.a[1] as Session);
      const foreignRef = w.refOf(w.groupB, w.b[1] as Session);
      return {
        own: { method: "GET", path: `/groups/${w.groupA}/members/${ref}/photo` },
        // the foreign case is both a group that is not theirs and, for group A, a ref that belongs to another group
        foreign: { method: "GET", path: `/groups/${w.groupB}/members/${foreignRef}/photo` },
        missing: { method: "GET", path: `/groups/${MISSING}/members/${MISSING}/photo` },
      };
    },
  },
  {
    method: "GET",
    pattern: "/groups/:groupId/members/:memberRef/photo",
    at: -3 * HOUR,
    calls: (w) => ({
      own: { method: "GET", path: `/groups/${w.groupA}/members/${w.refOf(w.groupA, w.a[1] as Session)}/photo` },
      foreign: { method: "GET", path: `/groups/${w.groupA}/members/${w.refOf(w.groupB, w.b[1] as Session)}/photo` },
      missing: { method: "GET", path: `/groups/${w.groupA}/members/${MISSING}/photo` },
    }),
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/checkin",
    at: -90 * MINUTE,
    calls: (w) => ({
      own: { method: "POST", path: `/groups/${w.groupA}/checkin`, body: {} },
      foreign: { method: "POST", path: `/groups/${w.groupB}/checkin`, body: {} },
      missing: { method: "POST", path: `/groups/${MISSING}/checkin`, body: {} },
    }),
  },
  {
    method: "GET",
    pattern: "/groups/:groupId/messages",
    at: -3 * HOUR,
    calls: (w) => ({
      own: { method: "GET", path: `/groups/${w.groupA}/messages` },
      foreign: { method: "GET", path: `/groups/${w.groupB}/messages` },
      missing: { method: "GET", path: `/groups/${MISSING}/messages` },
    }),
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/messages",
    at: -3 * HOUR,
    calls: (w) => ({
      own: { method: "POST", path: `/groups/${w.groupA}/messages`, body: note(1) },
      foreign: { method: "POST", path: `/groups/${w.groupB}/messages`, body: note(2) },
      missing: { method: "POST", path: `/groups/${MISSING}/messages`, body: note(3) },
    }),
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/downvotes",
    at: 15 * HOUR,
    calls: (w) => ({
      own: { method: "POST", path: `/groups/${w.groupA}/downvotes`, body: { memberRef: w.refOf(w.groupA, w.a[1] as Session) } },
      foreign: { method: "POST", path: `/groups/${w.groupB}/downvotes`, body: { memberRef: w.refOf(w.groupB, w.b[1] as Session) } },
      missing: { method: "POST", path: `/groups/${MISSING}/downvotes`, body: { memberRef: MISSING } },
    }),
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/downvotes",
    at: 15 * HOUR,
    calls: (w) => ({
      own: { method: "POST", path: `/groups/${w.groupA}/downvotes`, body: { memberRef: w.refOf(w.groupA, w.a[1] as Session) } },
      // my group, but a ref from another group
      foreign: { method: "POST", path: `/groups/${w.groupA}/downvotes`, body: { memberRef: w.refOf(w.groupB, w.b[1] as Session) } },
      missing: { method: "POST", path: `/groups/${w.groupA}/downvotes`, body: { memberRef: MISSING } },
    }),
  },
  {
    method: "DELETE",
    pattern: "/devices/:deviceId",
    at: -3 * HOUR,
    calls: async (w, me) => {
      const deviceOf = async (who: Session, n: number) => {
        const registered = await w.t.call("POST", "/devices", {
          token: who.token,
          body: { expoPushToken: `ExponentPushToken[audit${n}aaaaaaaaaaaaaaaaaaa]`, platform: "android" },
        });
        return ((await registered.json()) as { deviceId: string }).deviceId;
      };
      return {
        own: { method: "DELETE", path: `/devices/${await deviceOf(me, 1)}` },
        foreign: { method: "DELETE", path: `/devices/${await deviceOf(w.b[0] as Session, 2)}` },
        missing: { method: "DELETE", path: `/devices/${MISSING}` },
      };
    },
  },
  {
    method: "POST",
    pattern: "/reports",
    at: -3 * HOUR,
    calls: (w) => {
      const report = (groupId: string, memberRef: string, n: number, messageId?: string) => ({
        method: "POST",
        path: "/reports",
        body: {
          groupId,
          memberRef,
          body: "they were rude",
          clientId: `client-report-${n}`,
          ...(messageId === undefined ? {} : { messageId }),
        },
      });
      return {
        own: report(w.groupA, w.refOf(w.groupA, w.a[1] as Session), 1),
        foreign: report(w.groupB, w.refOf(w.groupB, w.b[1] as Session), 2),
        missing: report(MISSING, MISSING, 3),
      };
    },
  },
  {
    method: "POST",
    pattern: "/reports",
    at: -3 * HOUR,
    calls: (w) => {
      const report = (memberRef: string, n: number) => ({
        method: "POST",
        path: "/reports",
        body: { groupId: w.groupA, memberRef, body: "they were rude", clientId: `client-report-ref-${n}` },
      });
      return {
        own: report(w.refOf(w.groupA, w.a[1] as Session), 1),
        // my group, someone's ref from another group
        foreign: report(w.refOf(w.groupB, w.b[1] as Session), 2),
        missing: report(MISSING, 3),
      };
    },
  },
];

const key = (row: { method: string; pattern: string }) => `${row.method} ${row.pattern}`;
const send = (w: World, who: Session, call: Call) =>
  w.t.call(call.method, call.path, { token: who.token, ...(call.body === undefined ? {} : { body: call.body }) });

describe("S19 audit, routes that take an id", () => {
  test("every member route with an id in its path has a row here, and /reports is covered as well", async () => {
    const w = await world();
    const withId = appRoutes(w.t.app)
      // The show page is the same catalog for every member and has no owner, so the id is not an ownership question.
      .filter(
        (route) =>
          route.auth === "member" && route.pattern !== "/shows/:publicId" && (route.pattern.includes(":") || route.pattern === "/reports"),
      )
      .map(key);
    expect([...new Set(ID_ROWS.map(key))].sort()).toEqual([...new Set(withId)].sort());
  });

  for (const [index, row] of ID_ROWS.entries()) {
    test(`${key(row)} (case ${index + 1}): another member's id is the same 404 as an id that is nowhere, and the caller's own is not a 404`, async () => {
      const w = await world();
      const me = w.a[0] as Session;
      await w.at(row.at);
      const calls = await row.calls(w, me);
      const foreign = await send(w, me, calls.foreign);
      const missing = await send(w, me, calls.missing);
      expect([foreign.status, await foreign.clone().json()]).toEqual([404, NOT_FOUND]);
      expect([missing.status, await missing.clone().json()]).toEqual([404, NOT_FOUND]);
      expect(await foreign.text()).toBe(await missing.text());
      // The control: the same request with the caller's own ids is answered, so the 404 above comes from the guard.
      expect((await send(w, me, calls.own)).status).not.toBe(404);
    });
  }

  test("a foreign report or message leaves nothing behind", async () => {
    const w = await world();
    const me = w.a[0] as Session;
    await w.at(-3 * HOUR);
    for (const index of [1, 2]) {
      const calls = await (ID_ROWS.find((row) => key(row) === "POST /reports") as IdRow).calls(w, me);
      await send(w, me, index === 1 ? calls.foreign : calls.missing);
    }
    const message = await (ID_ROWS.find((row) => key(row) === "POST /groups/:groupId/messages") as IdRow).calls(w, me);
    await send(w, me, message.foreign);
    expect(w.t.db.query("SELECT (SELECT count(*) FROM report) AS reports, (SELECT count(*) FROM message) AS messages").get()).toEqual({
      reports: 0,
      messages: 0,
    });
  });

  test("a report that names another member's message id is a 400 and the same as one naming a message that is not there", async () => {
    const w = await world();
    const [me, other] = [w.a[0] as Session, w.a[1] as Session];
    await w.at(-3 * HOUR);
    const posted = await send(w, other, { method: "POST", path: `/groups/${w.groupA}/messages`, body: note(10) });
    const foreignMessage = ((await posted.json()) as { id: string }).id;
    const postedB = await w.t.call("POST", `/groups/${w.groupB}/messages`, { token: (w.b[1] as Session).token, body: note(11) });
    const messageInB = ((await postedB.json()) as { id: string }).id;
    const report = (memberRef: string, messageId: string, n: number) =>
      send(w, me, {
        method: "POST",
        path: "/reports",
        body: { groupId: w.groupA, memberRef, messageId, body: "text", clientId: `client-report-msg-${n}` },
      });
    // a message that belongs to a group the caller is not in, and one that is nowhere, are told the same
    const elsewhere = await report(w.refOf(w.groupA, other), messageInB, 1);
    const nowhere = await report(w.refOf(w.groupA, other), MISSING, 2);
    expect([elsewhere.status, nowhere.status]).toEqual([400, 400]);
    const refused = await nowhere.text();
    expect(await elsewhere.text()).toBe(refused);
    // the same person's message in a group the caller is not in (they were in both over time) is no better
    w.t.db
      .query("INSERT INTO message (id, group_id, member_id, member_ref, client_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("01hzzzzzzzzzzzzzzzzzzzzzzy", w.groupB, other.memberId, "oldref", "client-old", "an older note", w.t.clock().toISOString());
    const sameVoice = await report(w.refOf(w.groupA, other), "01hzzzzzzzzzzzzzzzzzzzzzzy", 5);
    expect(sameVoice.status).toBe(400);
    expect(await sameVoice.text()).toBe(refused);
    // a real message of that person is accepted, and a real message of someone else is refused
    expect((await report(w.refOf(w.groupA, other), foreignMessage, 3)).status).toBe(201);
    expect((await report(w.refOf(w.groupA, w.a[2] as Session), foreignMessage, 4)).status).toBe(400);
  });

  test("notices/read marks only the caller's own notices, whatever id it is given", async () => {
    const w = await world();
    const [me, other] = [w.a[0] as Session, w.b[0] as Session];
    await w.at(-3 * HOUR);
    const notices = (id: string) =>
      w.t.db.query("SELECT id, read_at FROM notice WHERE member_id = ? ORDER BY id").all(id) as { id: string; read_at: string | null }[];
    const theirs = notices(other.memberId);
    expect(theirs.length).toBeGreaterThan(0);
    const last = (theirs.at(-1) as { id: string }).id;
    const response = await w.t.call("POST", "/notices/read", { token: me.token, body: { upTo: "zzzzzzzzzzzzzzzzzzzzzzzzzz" } });
    expect(response.status).toBe(200);
    expect(notices(other.memberId)).toEqual(theirs);
    expect(notices(me.memberId).every((n) => n.read_at !== null)).toBe(true);
    // naming the other member's notice id by itself marks nothing of theirs and tells nothing about it
    const named = await w.t.call("POST", "/notices/read", { token: me.token, body: { upTo: last } });
    expect(named.status).toBe(200);
    expect(notices(other.memberId)).toEqual(theirs);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// No co-member identity in any response, at any time.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Keys that name a person's identity. The caller's own record (`/me`) has some of them and is held to the value check instead. */
const IDENTITY_KEYS = [
  "memberId",
  "member_id",
  "userId",
  "gender",
  "handle",
  "handleUrl",
  "instagram",
  "phone",
  "phoneE164",
  "photoKey",
  "photo_key",
];

const keysOf = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) for (const item of value) keysOf(item, found);
  else if (value !== null && typeof value === "object") {
    for (const [name, inner] of Object.entries(value)) {
      found.push(name);
      keysOf(inner, found);
    }
  }
  return found;
};

const TIMES = [
  -5 * HOUR,
  -3 * HOUR - MINUTE,
  -3 * HOUR,
  -90 * MINUTE,
  0,
  HOUR + MINUTE,
  15 * HOUR,
  24 * HOUR + MINUTE,
  4 * 24 * HOUR,
  31 * 24 * HOUR,
];

describe("S19 audit, nothing about a co-member leaves the server", () => {
  test("at every point from before the reveal to after the thread is gone, no response or log line names another member by id, phone, handle or gender", async () => {
    const w = await world();
    const everyone: Session[] = [...w.a, ...w.b, ...w.y, w.waiting];
    const idOf = new Map(everyone.map((who) => [who, PHONES.indexOf(who.phone)]));
    const rawPhotoKey = (who: Session) =>
      (w.t.db.query("SELECT photo_key FROM profile WHERE member_id = ?").get(who.memberId) as { photo_key: string }).photo_key;
    const bodies: { viewer: Session; at: number; path: string; text: string }[] = [];
    let seen = 0;

    const collect = async (viewer: Session, at: number, call: Call) => {
      const response = await send(w, viewer, call);
      const text = await response.text();
      bodies.push({ viewer, at, path: `${call.method} ${call.path}`, text });
      seen++;
      return response;
    };

    // One report suspends its subject, so it is made once, at the reveal, and the suspended member is left out after that.
    const suspended = new Set<Session>();
    for (const at of TIMES) {
      await w.at(at, ...everyone.filter((who) => !suspended.has(who)));
      const active = w.a.filter((who) => !suspended.has(who));
      for (const [index, who] of active.entries()) {
        await collect(who, at, {
          method: "POST",
          path: `/groups/${w.groupA}/messages`,
          body: { body: `hello from ${index}`, clientId: `client-crawl-${at}-${index}` },
        });
        await collect(who, at, { method: "POST", path: `/groups/${w.groupA}/checkin`, body: {} });
      }
      for (const who of [w.a[0] as Session, w.a[2] as Session]) {
        await collect(who, at, {
          method: "POST",
          path: `/groups/${w.groupA}/downvotes`,
          body: { memberRef: w.refOf(w.groupA, w.a[3] as Session) },
        });
      }
      if (at === -3 * HOUR) {
        await collect(w.a[0] as Session, at, {
          method: "POST",
          path: "/reports",
          body: { groupId: w.groupA, memberRef: w.refOf(w.groupA, w.a[1] as Session), body: "a note", clientId: "client-crawl-report" },
        });
        suspended.add(w.a[1] as Session);
      }
      for (const viewer of [...active, w.b[0] as Session, w.y[0] as Session, w.waiting]) {
        const calls: Call[] = [
          { method: "GET", path: "/me" },
          { method: "GET", path: "/plans" },
          { method: "GET", path: `/plans/${w.planOf.get(viewer.memberId)}` },
          { method: "GET", path: "/notices" },
          { method: "GET", path: "/me/blocked" },
          { method: "GET", path: "/shows/show-x" },
          { method: "GET", path: `/groups/${w.groupA}` },
          { method: "GET", path: `/groups/${w.groupB}` },
          { method: "GET", path: `/groups/${w.groupA}/messages` },
          ...w.a.map((who): Call => ({ method: "GET", path: `/groups/${w.groupA}/members/${w.refOf(w.groupA, who)}/photo` })),
        ];
        for (const call of calls) await collect(viewer, at, call);
      }
    }
    expect(seen).toBeGreaterThan(TIMES.length * 80);
    expect(bodies.some((entry) => entry.path.includes("/messages") && entry.text.includes("hello from"))).toBe(true);
    expect(bodies.some((entry) => entry.path === `GET /groups/${w.groupA}` && entry.text.includes("members"))).toBe(true);

    const groupOf = (who: Session) => (w.a.includes(who) ? w.groupA : w.b.includes(who) ? w.groupB : w.y.includes(who) ? w.groupY : null);
    for (const { viewer, at, path, text } of bodies) {
      const where = `${path} as member ${idOf.get(viewer)} at ${at / MINUTE} minutes`;
      const others = everyone.filter((who) => who !== viewer);
      for (const other of others) {
        const index = idOf.get(other) as number;
        expect([where, text.includes(other.memberId)]).toEqual([where, false]);
        expect([where, text.includes(other.phone), text.includes(other.phone.slice(1))]).toEqual([where, false, false]);
        expect([where, new RegExp(`member_${index}\\b`).test(text)]).toEqual([where, false]);
        // a photo of someone outside the caller's group never shows, and a co-member's only from the reveal on
        const sameGroup = groupOf(viewer) !== null && groupOf(viewer) === groupOf(other);
        const key = rawPhotoKey(other);
        if (!sameGroup || at < -3 * HOUR) expect([where, text.includes(key)]).toEqual([where, false]);
        // and the same for the first name: nobody outside the group, and a co-member only from the reveal on
        if (!sameGroup || at < -3 * HOUR) expect([where, new RegExp(`Person${index}\\b`).test(text)]).toEqual([where, false]);
      }
      if (path !== "GET /me") {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // an empty body (204) or a plain error line holds no keys
        }
        expect([where, keysOf(parsed).filter((name) => IDENTITY_KEYS.includes(name))]).toEqual([where, []]);
      }
    }

    // the log line is the route pattern, the status, the time and a hash, so none of it can hold these either
    const logged = JSON.stringify(w.t.logs);
    expect(w.t.logs.length).toBeGreaterThan(0);
    for (const who of everyone) {
      const index = idOf.get(who) as number;
      for (const secret of [who.memberId, who.phone, who.phone.slice(1), `Person${index}`, `member_${index}"`, rawPhotoKey(who)]) {
        expect([secret, logged.includes(secret)]).toEqual([secret, false]);
      }
    }
    for (const who of w.a) for (const other of w.a) if (who !== other) expect(logged.includes(w.refOf(w.groupA, other))).toBe(false);
  });
});
