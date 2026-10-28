import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { messageListResponseSchema, messageSchema } from "@turnout/contract/app/thread";
import { deleteExpiredMessages, listMessages, postMessage } from "../src/social/thread.js";
import type { Session } from "./helpers/appFixture.js";
import { type Setup, setup } from "./helpers/groupFixture.js";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;
const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;

const read = (s: Setup, who: Session, query = "") => s.t.call("GET", `/groups/${s.groupId}/messages${query}`, { token: who.token });
const post = (s: Setup, who: Session, body: unknown, id = s.groupId) =>
  s.t.call("POST", `/groups/${id}/messages`, { token: who.token, body });
const say = (text: string, clientId = `client-${text.replaceAll(" ", "-")}`) => ({ body: text, clientId });
const thread = async (s: Setup, who: Session, query = "") => messageListResponseSchema.parse(await (await read(s, who, query)).json());
const noticesFor = (s: Setup, who: Session) =>
  s.t.db.query("SELECT id FROM notice WHERE member_id = ? AND kind = 'thread_message'").all(who.memberId).length;

describe("the thread window", () => {
  test("a member who is in the group gets a 404 until T-3h and the thread from T-3h", async () => {
    const s = await setup();
    const me = s.members[0] as Session;
    await s.at(-3 * HOUR - MINUTE);
    expect((await read(s, me)).status).toBe(404);
    const early = await post(s, me, say("hello early"));
    expect(early.status).toBe(404);
    expect((await errorOf(early)).code).toBe("not_found");
    await s.at(-3 * HOUR);
    expect(await thread(s, me)).toEqual({ messages: [], thread: "open" });
    expect((await post(s, me, say("hello there"))).status).toBe(201);
  });

  test("posting works until T+24h, then it is a 409 and the thread reads as read-only", async () => {
    const s = await setup();
    const me = s.members[0] as Session;
    await s.at(-2 * HOUR);
    await post(s, me, say("see you there"));
    await s.at(24 * HOUR - MINUTE);
    expect((await post(s, me, say("still open"))).status).toBe(201);
    await s.at(24 * HOUR);
    const late = await post(s, me, say("too late now"));
    expect(late.status).toBe(409);
    expect((await errorOf(late)).code).toBe("outside_window");
    const body = await thread(s, s.members[1] as Session);
    expect(body.thread).toBe("read_only");
    expect(body.messages.map((m) => m.body)).toEqual(["see you there", "still open"]);
  });

  test("30 days after the start the thread is a 404 again", async () => {
    const s = await setup();
    const me = s.members[0] as Session;
    await s.at(-2 * HOUR);
    await post(s, me, say("a note"));
    await s.at(30 * DAY - MINUTE);
    expect((await read(s, me)).status).toBe(200);
    await s.at(30 * DAY);
    expect((await read(s, me)).status).toBe(404);
    expect((await post(s, me, say("another note"))).status).toBe(404);
  });

  test("someone who is not in the group, a member who withdrew and a made-up id are the same 404", async () => {
    const s = await setup(5);
    await s.at(-3 * HOUR);
    const [me, leaver] = s.members as [Session, Session];
    const plan = (await (await s.t.call("GET", "/plans", { token: leaver.token })).json()) as { plans: { id: string }[] };
    expect((await s.t.call("POST", `/plans/${plan.plans[0]?.id}/withdraw`, { token: leaver.token })).status).toBe(200);
    const answers = [
      await read(s, leaver),
      await post(s, leaver, say("let me in")),
      await s.t.call("GET", "/groups/01hzzzzzzzzzzzzzzzzzzzzzzz/messages", { token: me.token }),
    ];
    expect(answers.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(await answers[0]?.json()).toEqual(await answers[2]?.json());
  });
});

describe("POST /groups/:groupId/messages", () => {
  test("stores the text under the sender's ref, never their member id, and shows it to the group", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const [me, other] = s.members as [Session, Session];
    const sent = await post(s, me, say("  I am by the door  ", "client-door-1"));
    expect(sent.status).toBe(201);
    const message = messageSchema.parse(await sent.json());
    expect(message).toMatchObject({ body: "I am by the door", firstName: "Person0", isYou: true });
    const ref = (s.t.db.query("SELECT member_ref FROM group_member WHERE member_id = ?").get(me.memberId) as { member_ref: string })
      .member_ref;
    expect(message.memberRef).toBe(ref);
    const seen = await thread(s, other);
    expect(seen.messages).toHaveLength(1);
    expect(seen.messages[0]).toMatchObject({ id: message.id, isYou: false, memberRef: ref });
    expect(JSON.stringify(seen)).not.toContain(me.memberId);
  });

  test("a retried clientId stores one message and answers with it", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    const first = await post(s, me, say("on my way", "client-retry-1"));
    const second = await post(s, me, say("on my way", "client-retry-1"));
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(await second.json()).toEqual(await first.json());
    expect(s.t.db.query("SELECT count(*) AS n FROM message").get()).toEqual({ n: 1 });
  });

  test("a retry of a stored message still answers when the sender is at the rate limit", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    for (let i = 0; i < 30; i++) expect((await post(s, me, say(`m${i}`, `client-rate-${i}`))).status).toBe(201);
    expect((await post(s, me, say("m0", "client-rate-0"))).status).toBe(200);
  });

  test("31 messages in a minute is a 429 with Retry-After, and the minute after is open again", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    for (let i = 0; i < 30; i++) expect((await post(s, me, say(`m${i}`, `client-limit-${i}`))).status).toBe(201);
    const over = await post(s, me, say("one too many", "client-limit-31"));
    expect(over.status).toBe(429);
    expect((await errorOf(over)).code).toBe("rate_limited");
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(s.t.db.query("SELECT count(*) AS n FROM message").get()).toEqual({ n: 30 });
    s.t.clock.advance(61 * 1000);
    s.members[0]!.token = (await s.t.signIn(me.phone)).accessToken;
    expect((await post(s, s.members[0] as Session, say("one too many", "client-limit-31"))).status).toBe(201);
  });

  test("refuses an empty message, 1,001 characters, HTML, an extra field and a short clientId", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    const bad = [
      say("   ", "client-empty-1"),
      say("x".repeat(1001), "client-long-1"),
      say("<b>hi</b>", "client-html-1"),
      { ...say("fine", "client-extra-1"), lat: 17.4 },
      say("fine", "short"),
      { body: "no id" },
    ];
    for (const body of bad) {
      const response = await post(s, me, body);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("invalid_request");
    }
    expect((await post(s, me, say("x".repeat(1000), "client-edge-1"))).status).toBe(201);
    expect((await post(s, me, say("🙂".repeat(1000), "client-emoji-1"))).status).toBe(201);
    expect(s.t.db.query("SELECT count(*) AS n FROM message").get()).toEqual({ n: 2 });
  });
});

describe("GET /groups/:groupId/messages", () => {
  test("pages 100 at a time, oldest first, after a message id", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const [me, other] = s.members as [Session, Session];
    for (let i = 0; i < 120; i++) {
      s.t.clock.advance(1000);
      s.t.db
        .query("INSERT INTO message (id, group_id, member_id, member_ref, client_id, body, created_at) VALUES (?, ?, ?, 'ref', ?, ?, ?)")
        .run(
          `01j${String(i).padStart(23, "0")}`,
          s.groupId,
          i % 2 === 0 ? me.memberId : other.memberId,
          `seed-${i}`,
          `text ${i}`,
          s.t.clock().toISOString(),
        );
    }
    const first = await thread(s, me);
    expect(first.messages).toHaveLength(100);
    expect(first.messages[0]?.body).toBe("text 0");
    const rest = await thread(s, me, `?after=${first.messages[99]?.id}`);
    expect(rest.messages.map((m) => m.body)).toEqual(Array.from({ length: 20 }, (_, i) => `text ${100 + i}`));
    expect(first.messages.slice(0, 2).map((m) => m.isYou)).toEqual([true, false]);
    expect((await read(s, me, `?after=${"x".repeat(41)}`)).status).toBe(400);
  });
});

describe("the ?after= cursor", () => {
  test("a message stored late with an earlier clock reading still comes after the cursor", async () => {
    const s = await setup();
    await s.at(-2 * HOUR);
    const [me, other] = s.members as [Session, Session];
    const now = s.t.clock();
    const earlier = new Date(now.getTime() - 5000);
    // A reader takes the cursor after the first message. The second post read its clock before the first was stored, but commits after it.
    const first = postMessage(s.t.db, s.groupId, me.memberId, say("first", "client-first-1"), now);
    const cursor = (first.ok ? first.message.id : "") as string;
    const second = postMessage(s.t.db, s.groupId, other.memberId, say("second", "client-second-1"), earlier);
    expect(second.ok && second.message.id > cursor).toBe(true);
    const page = listMessages(s.t.db, s.groupId, me.memberId, cursor, now);
    expect(page.ok && page.messages.map((m) => m.body)).toEqual(["second"]);
    const all = listMessages(s.t.db, s.groupId, me.memberId, undefined, now);
    expect(all.ok && all.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });

  test("two messages that read the same millisecond keep the order they were stored in", async () => {
    const s = await setup();
    await s.at(-2 * HOUR);
    const [me, other] = s.members as [Session, Session];
    const now = s.t.clock();
    const ids = [
      postMessage(s.t.db, s.groupId, me.memberId, say("one", "client-same-1"), now),
      postMessage(s.t.db, s.groupId, other.memberId, say("two", "client-same-2"), now),
      postMessage(s.t.db, s.groupId, me.memberId, say("three", "client-same-3"), new Date(now.getTime() - 1)),
    ].map((r) => (r.ok ? r.message.id : ""));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("the thread_message notice", () => {
  test("goes to a member who has been away, not to the sender or to someone reading now", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const [sender, reading, away1, away2] = s.members as [Session, Session, Session, Session];
    await read(s, reading);
    s.t.clock.advance(11 * MINUTE);
    await read(s, reading);
    await post(s, sender, say("first words"));
    expect(noticesFor(s, sender)).toBe(0);
    expect(noticesFor(s, reading)).toBe(0);
    expect(noticesFor(s, away1)).toBe(1);
    expect(noticesFor(s, away2)).toBe(1);
  });

  test("is sent at most once per plan every 5 minutes", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const [sender, away] = s.members as [Session, Session];
    await post(s, sender, say("one", "client-note-1"));
    s.t.clock.advance(2 * MINUTE);
    await post(s, sender, say("two", "client-note-2"));
    expect(noticesFor(s, away)).toBe(1);
    s.t.clock.advance(4 * MINUTE);
    s.members[0]!.token = (await s.t.signIn(sender.phone)).accessToken;
    await post(s, s.members[0] as Session, say("three", "client-note-3"));
    expect(noticesFor(s, away)).toBe(2);
  });

  test("a notice holds no message text and no name", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const [sender, away] = s.members as [Session, Session];
    await post(s, sender, say("a private plan for tonight"));
    const body = JSON.stringify(await (await s.t.call("GET", "/notices", { token: away.token })).json());
    expect(body).toContain("thread_message");
    expect(body).not.toContain("private plan");
    expect(body).not.toContain("Person0");
  });
});

describe("thread_presence", () => {
  test("is written when a member reads and moves forward on each read", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    const seenAt = () =>
      (s.t.db.query("SELECT seen_at FROM thread_presence WHERE member_id = ?").get(me.memberId) as { seen_at: string } | null)?.seen_at;
    expect(seenAt()).toBeUndefined();
    await read(s, me);
    const first = seenAt();
    expect(first).toBe(s.t.clock().toISOString());
    s.t.clock.advance(3 * MINUTE);
    await read(s, me);
    expect(seenAt()).toBe(s.t.clock().toISOString());
    expect(s.t.db.query("SELECT count(*) AS n FROM thread_presence").get()).toEqual({ n: 1 });
  });

  test("a read that is refused leaves no row", async () => {
    const s = await setup();
    await s.at(-4 * HOUR);
    await read(s, s.members[0] as Session);
    expect(s.t.db.query("SELECT count(*) AS n FROM thread_presence").get()).toEqual({ n: 0 });
  });
});

describe("message retention", () => {
  test("housekeeping deletes messages and presence 30 days after the start, and not before", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    await post(s, me, say("a note to keep"));
    await read(s, me);
    expect(deleteExpiredMessages(s.t.db, new Date(s.t.clock().getTime() + 30 * DAY + 3 * HOUR - MINUTE))).toBe(0);
    expect(s.t.db.query("SELECT count(*) AS n FROM message").get()).toEqual({ n: 1 });
    expect(deleteExpiredMessages(s.t.db, new Date(s.t.clock().getTime() + 30 * DAY + 3 * HOUR))).toBe(1);
    expect(s.t.db.query("SELECT count(*) AS n FROM message").get()).toEqual({ n: 0 });
    expect(s.t.db.query("SELECT count(*) AS n FROM thread_presence").get()).toEqual({ n: 0 });
  });
});
