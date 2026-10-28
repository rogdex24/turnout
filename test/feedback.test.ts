import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { blockedResponseSchema } from "@turnout/contract/app/feedback";
import { groupRevealedSchema } from "@turnout/contract/app/groups";
import { banReason } from "../src/social/bans.js";
import { closeFeedback, downvote, REINSTATE_ACTION } from "../src/social/feedback.js";
import { milestones } from "../src/social/model/schedule.js";
import { type TestApp, testApp } from "./appHelpers.js";
import type { Session } from "./helpers/appFixture.js";
import { type Setup, setup } from "./helpers/groupFixture.js";
import { pastGroup } from "./helpers/pastGroup.js";
import { SHOW_START, seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const START = Date.parse(SHOW_START);
const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;
const FEEDBACK_OPENS = START + 14.5 * HOUR;
const FEEDBACK_CLOSES = Date.parse(milestones(SHOW_START).feedbackClosesAt);

const vote = (s: Setup, who: Session, memberRef: unknown, id = s.groupId) =>
  s.t.call("POST", `/groups/${id}/downvotes`, { token: who.token, body: { memberRef } });
const refOf = async (s: Setup, who: Session, of: Session): Promise<string> => {
  const group = groupRevealedSchema.parse(await (await s.t.call("GET", `/groups/${s.groupId}`, { token: who.token })).json());
  const i = s.members.indexOf(of);
  const names = group.members.map((m) => m.firstName);
  return (group.members[names.indexOf(`Person${i}`)] as { memberRef: string }).memberRef;
};
const voteRows = (s: Setup) => s.t.db.query("SELECT voter_id, target_id FROM downvote").all() as { voter_id: string; target_id: string }[];

describe("POST /groups/:groupId/downvotes", () => {
  test("a member gives a downvote after the morning after, and a repeat changes nothing", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(15 * HOUR);
    const ref = await refOf(s, a, b);
    const first = await vote(s, a, ref);
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");
    expect((await vote(s, a, ref)).status).toBe(204);
    expect(voteRows(s)).toEqual([{ voter_id: a.memberId, target_id: b.memberId }]);
  });

  test("it is private: nobody is told and the target sees nothing of it", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(15 * HOUR);
    const noticesBefore = s.t.db.query("SELECT id FROM notice").all().length;
    await vote(s, a, await refOf(s, a, b));
    expect(s.t.db.query("SELECT id FROM notice").all().length).toBe(noticesBefore);
    const mine = groupRevealedSchema.parse(await (await s.t.call("GET", `/groups/${s.groupId}`, { token: b.token })).json());
    expect(mine.downvotedRefs).toEqual([]);
  });

  test("yourself, a ref that is not in the group, another group and an outsider are the same 404", async () => {
    const s = await setup(5);
    const [a, b] = s.members as [Session, Session];
    await s.at(15 * HOUR);
    const own = await refOf(s, a, a);
    for (const response of [await vote(s, a, own), await vote(s, a, "no-such-ref"), await vote(s, a, "x", "no-such-group")]) {
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("not_found");
    }
    const outsider = await s.t.signIn((await import("./appHelpers.js")).PHONES[15] as string);
    const stranger = { token: outsider.accessToken } as Session;
    expect((await vote(s, stranger, await refOf(s, a, b))).status).toBe(404);
    expect(voteRows(s)).toEqual([]);
  });

  test("before the morning after and after the 72 hours it is a 409, each boundary on the later side", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(-2 * HOUR);
    const ref = await refOf(s, a, b);
    await s.at(10 * HOUR);
    const early = await vote(s, a, ref);
    expect(early.status).toBe(409);
    expect((await errorOf(early)).code).toBe("outside_window");
    await s.at(FEEDBACK_OPENS - START - MINUTE);
    expect((await vote(s, a, ref)).status).toBe(409);
    await s.at(FEEDBACK_OPENS - START);
    expect((await vote(s, a, ref)).status).toBe(204);
    await s.at(FEEDBACK_CLOSES - START - MINUTE);
    expect((await vote(s, a, ref)).status).toBe(204);
    await s.at(FEEDBACK_CLOSES - START);
    expect(downvote(s.t.db, s.groupId, a.memberId, ref, s.t.clock())).toEqual({ ok: false, error: "outside_window" });
  });

  test("a body with another field, or no memberRef, is refused", async () => {
    const s = await setup();
    const a = s.members[0] as Session;
    await s.at(15 * HOUR);
    for (const body of [{}, { memberRef: "x", reason: "rude" }, { memberRef: "" }, { memberRef: 5 }]) {
      const response = await s.t.call("POST", `/groups/${s.groupId}/downvotes`, { token: a.token, body });
      expect(response.status).toBe(400);
    }
  });

  test("the group shows when feedback closes and which refs the caller marked", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(-2 * HOUR);
    const before = groupRevealedSchema.parse(await (await s.t.call("GET", `/groups/${s.groupId}`, { token: a.token })).json());
    expect(before.feedbackOpenUntil).toBeUndefined();
    expect(before.downvotedRefs).toBeUndefined();
    const ref = await refOf(s, a, b);
    await s.at(15 * HOUR);
    await vote(s, a, ref);
    const group = groupRevealedSchema.parse(await (await s.t.call("GET", `/groups/${s.groupId}`, { token: a.token })).json());
    expect(group.feedbackOpenUntil).toBe(milestones(SHOW_START).feedbackClosesAt);
    expect(group.downvotedRefs).toEqual([ref]);
  });
});

describe("closing the feedback window: met edges", () => {
  const edges = (s: Setup) => s.t.db.query("SELECT member_a, member_b FROM met_edge").all() as { member_a: string; member_b: string }[];
  const close = (s: Setup) => closeFeedback(s.t.db, s.t.app.config.banPepper, s.t.clock(), s.t.app.config.tunables);

  async function checkedIn(s: Setup, who: Session[]) {
    await s.at(-60 * MINUTE);
    for (const m of who) expect((await s.t.call("POST", `/groups/${s.groupId}/checkin`, { token: m.token })).status).toBe(200);
  }

  test("pairs who both checked in become edges once, and a member who did not check in has none", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await checkedIn(s, [a, b, c]);
    await s.at(FEEDBACK_CLOSES - START - MINUTE);
    expect(close(s)).toEqual({ closed: 0, edges: 0, stopped: 0 });
    await s.at(FEEDBACK_CLOSES - START);
    expect(close(s)).toEqual({ closed: 1, edges: 3, stopped: 0 });
    const ids = [a, b, c].map((m) => m.memberId).sort();
    expect(edges(s).map((e) => `${e.member_a}:${e.member_b}`)).toEqual([
      `${ids[0]}:${ids[1]}`,
      `${ids[0]}:${ids[2]}`,
      `${ids[1]}:${ids[2]}`,
    ]);
    expect(close(s)).toEqual({ closed: 0, edges: 0, stopped: 0 });
    expect(edges(s).length).toBe(3);
  });

  test("one downvote in the group means no edges for anyone there", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await checkedIn(s, [a, b, c]);
    await s.at(15 * HOUR);
    await vote(s, a, await refOf(s, a, b));
    await s.at(FEEDBACK_CLOSES - START);
    expect(close(s)).toEqual({ closed: 1, edges: 0, stopped: 0 });
    expect(edges(s)).toEqual([]);
    expect(s.t.db.query("SELECT status FROM member WHERE id = ?").get(b.memberId)).toEqual({ status: "active" });
  });

  test("the ticker closes the window, with nothing to do on later passes", async () => {
    const s = await setup();
    await checkedIn(s, [s.members[0] as Session, s.members[1] as Session]);
    await s.at(FEEDBACK_CLOSES - START);
    const { runTickerPass } = await import("../src/app-api/ticker.js");
    await runTickerPass(s.t.app, "test-holder");
    expect(edges(s).length).toBe(1);
    await runTickerPass(s.t.app, "test-holder");
    expect(edges(s).length).toBe(1);
    expect(s.t.db.query("SELECT group_id FROM feedback_close").all().length).toBe(1);
  });
});

describe("the stop rule", () => {
  const DAYS = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map((d) => `${d}T14:00:00.000Z`);

  /** `voters` people each downvote the target at one of the shows, in a different group per show (`shows` of them). */
  function scene(t: TestApp, voters: number, shows: number) {
    const target = seedMember(t.db, t.clock(), { phoneIndex: 0, name: "Target" });
    const people = Array.from({ length: voters }, (_, i) => seedMember(t.db, t.clock(), { phoneIndex: i + 1, name: `Voter${i}` }));
    const groups = Array.from({ length: shows }, (_, i) =>
      pastGroup(t.db, { startsAt: DAYS[i] as string, memberIds: [target, ...people] }),
    );
    people.forEach((voter, i) => {
      const group = groups[i % shows] as ReturnType<typeof pastGroup>;
      t.db
        .query("INSERT INTO downvote (id, group_id, voter_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(`dv-${voter}-${group.groupId}`, group.groupId, voter, target, DAYS[i % shows] as string);
    });
    return { target, people, groups };
  }
  const run = (t: TestApp) => {
    t.clock.set(new Date("2026-10-26T00:00:00Z"));
    return closeFeedback(t.db, t.app.config.banPepper, t.clock(), t.app.config.tunables);
  };
  const statusOf = (t: TestApp, id: string) => t.db.query("SELECT status, status_reason FROM member WHERE id = ?").get(id);

  test("3 voters at 2 shows do not stop anyone", async () => {
    const t = await testApp();
    const { target } = scene(t, 3, 2);
    expect(run(t).stopped).toBe(0);
    expect(statusOf(t, target)).toEqual({ status: "active", status_reason: null });
  });

  test("2 voters at 3 shows do not stop anyone", async () => {
    const t = await testApp();
    const { target } = scene(t, 2, 3);
    expect(run(t).stopped).toBe(0);
    expect(statusOf(t, target)).toEqual({ status: "active", status_reason: null });
  });

  test("3 voters at 3 shows stop the member: marked on the ban list, still signed in, plans withdrawn, no new plan", async () => {
    const t = await testApp();
    const { target } = scene(t, 3, 3);
    seedShow(t.db, { id: "later", startsAt: "2026-12-20T14:00:00.000Z" });
    const open = waitingPlan(t.db, target, "later", new Date("2026-10-20T00:00:00Z"));
    expect(open.state).toBe("finding_group");
    expect(run(t).stopped).toBe(1);
    expect(statusOf(t, target)).toEqual({ status: "stopped", status_reason: "downvote_stop" });
    const phone = (t.db.query("SELECT phone_e164 FROM member WHERE id = ?").get(target) as { phone_e164: string }).phone_e164;
    expect(banReason(t.db, t.app.config.banPepper, phone)).toBe("downvote_stop");
    expect(t.db.query("SELECT state, reason FROM plan WHERE id = ?").get(open.id)).toEqual({ state: "withdrawn", reason: "stopped" });
    // Still a member: signs in, browses, and is told grouping has stopped when they try to join.
    const session = await t.signIn(phone);
    expect((await t.call("GET", "/plans", { token: session.accessToken })).status).toBe(200);
    expect((await t.call("GET", "/me", { token: session.accessToken })).status).toBe(200);
    const again = await t.call("POST", "/plans", { token: session.accessToken, body: { eventId: "later", groupType: "open" } });
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe("not_matchable");
  });

  test("the same pass is idempotent", async () => {
    const t = await testApp();
    scene(t, 3, 3);
    expect(run(t).stopped).toBe(1);
    expect(run(t)).toEqual({ closed: 0, edges: 0, stopped: 0 });
    expect(t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 1 });
  });

  test("votes from before an operator reinstatement are not counted again", async () => {
    const t = await testApp();
    const { target } = scene(t, 3, 3);
    t.db
      .query(
        "INSERT INTO operator_action (id, action, subject_type, subject_id, created_at) VALUES ('op1', ?, 'member', ?, '2026-10-01T00:00:00.000Z')",
      )
      .run(REINSTATE_ACTION, target);
    expect(run(t).stopped).toBe(0);
    expect(statusOf(t, target)).toEqual({ status: "active", status_reason: null });
  });
});

describe("GET /me/blocked", () => {
  test("lists first name, show and date for each downvote and report, and nothing else", async () => {
    const t = await testApp();
    const me = await (await import("./helpers/appFixture.js")).memberSession(t, 0, { name: "Mina", gender: "woman" });
    const a = seedMember(t.db, t.clock(), { phoneIndex: 5, name: "Arun" });
    const b = seedMember(t.db, t.clock(), { phoneIndex: 6, name: "Bala" });
    const g1 = pastGroup(t.db, { startsAt: "2026-09-01T14:00:00.000Z", memberIds: [me.memberId, a] });
    const g2 = pastGroup(t.db, { startsAt: "2026-09-08T14:00:00.000Z", memberIds: [me.memberId, b] });
    t.db
      .query("INSERT INTO downvote (id, group_id, voter_id, target_id, created_at) VALUES ('d1', ?, ?, ?, '2026-09-02T00:00:00.000Z')")
      .run(g1.groupId, me.memberId, a);
    t.db
      .query(
        `INSERT INTO report (id, group_id, reporter_id, subject_id, body, client_id, subject_status_before, created_at, due_at)
         VALUES ('r1', ?, ?, ?, 'a report', 'c1', 'active', '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z')`,
      )
      .run(g2.groupId, me.memberId, b);
    // Someone who downvoted me is not on my list.
    t.db
      .query("INSERT INTO downvote (id, group_id, voter_id, target_id, created_at) VALUES ('d2', ?, ?, ?, '2026-09-02T00:00:00.000Z')")
      .run(g1.groupId, a, me.memberId);
    const response = await t.call("GET", "/me/blocked", { token: me.token });
    expect(response.status).toBe(200);
    expect(blockedResponseSchema.parse(await response.json()).blocked).toEqual([
      { firstName: "Bala", showTitle: `Show ${g2.showId}`, date: "2026-09-08T14:00:00.000Z" },
      { firstName: "Arun", showTitle: `Show ${g1.showId}`, date: "2026-09-01T14:00:00.000Z" },
    ]);
    const other = await (await import("./helpers/appFixture.js")).memberSession(t, 1, { name: "Zed", gender: "man" });
    expect(blockedResponseSchema.parse(await (await t.call("GET", "/me/blocked", { token: other.token })).json())).toEqual({ blocked: [] });
  });
});
