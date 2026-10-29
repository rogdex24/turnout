import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import {
  checkinResponseSchema,
  groupBeforeRevealSchema,
  groupRevealedSchema,
  memberPhotoResponseSchema,
} from "@turnout/contract/app/groups";
import { planSchema } from "@turnout/contract/app/plans";
import { milestones } from "../src/social/model/schedule.js";
import { setCafe } from "../src/social/operator.js";
import { memberSession, type Session } from "./helpers/appFixture.js";
import { type Setup, setup } from "./helpers/groupFixture.js";
import { SHOW_START } from "./helpers/socialFixture.js";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const START = Date.parse(SHOW_START);
const BASE = "/api/app/v1";
const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;

const group = (s: Setup, who: Session, id = s.groupId) => s.t.call("GET", `/groups/${id}`, { token: who.token });

describe("GET /groups/:groupId before T-3h", () => {
  test("holds the state, the size and the times, and no member, no cafe, no ref and no photo", async () => {
    const s = await setup();
    await s.at(-5 * HOUR);
    const response = await group(s, s.members[0] as Session);
    expect(response.status).toBe(200);
    const raw = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(["belowPlan", "meetAt", "revealAt", "showSnapshot", "size", "state"]);
    const body = groupBeforeRevealSchema.parse(raw);
    expect(body).toMatchObject({ state: "locked", size: 4, belowPlan: false });
    expect(body.revealAt).toBe(new Date(START - 3 * HOUR).toISOString());
    expect(body.meetAt).toBe(new Date(START - 60 * MINUTE).toISOString());
    const text = JSON.stringify(raw);
    for (const other of s.members.slice(1)) expect(text).not.toContain(other.memberId);
    expect(text).not.toContain("Person1");
  });

  test("a photo route answer before the reveal is the same 404 as for a made-up ref", async () => {
    const s = await setup();
    await s.at(-5 * HOUR);
    const ref = (
      s.t.db.query("SELECT member_ref FROM group_member WHERE member_id = ?").get((s.members[1] as Session).memberId) as {
        member_ref: string;
      }
    ).member_ref;
    const real = await s.t.call("GET", `/groups/${s.groupId}/members/${ref}/photo`, { token: (s.members[0] as Session).token });
    const fake = await s.t.call("GET", `/groups/${s.groupId}/members/not-a-ref/photo`, { token: (s.members[0] as Session).token });
    expect(real.status).toBe(404);
    expect(await real.json()).toEqual(await fake.json());
  });

  test("another member's group, a made-up id and a person who is not in it are one 404", async () => {
    const s = await setup();
    const outsider = await memberSession(s.t, 9);
    const answers = await Promise.all([group(s, outsider), group(s, s.members[0] as Session, "01hzzzzzzzzzzzzzzzzzzzzzzz")]);
    expect(answers.map((r) => r.status)).toEqual([404, 404]);
    expect(await answers[0]?.json()).toEqual(await answers[1]?.json());
  });
});

describe("GET /groups/:groupId from T-3h", () => {
  test("names the members, with a ref and a signed photo link for each, and the venue entrance when no cafe is set", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const response = await group(s, s.members[0] as Session);
    const body = groupRevealedSchema.parse(await response.json());
    expect(body.members.map((m) => m.firstName).sort()).toEqual(["Person0", "Person1", "Person2", "Person3"]);
    expect(body.members.filter((m) => m.isYou).map((m) => m.firstName)).toEqual(["Person0"]);
    expect(body.members.every((m) => m.photoUrl?.startsWith(`${BASE}/files/photos/`) ?? false)).toBe(true);
    expect(body.members.every((m) => !m.checkedIn)).toBe(true);
    expect(body.cafe.isFallback).toBe(true);
    expect(body.cafe.name).toStartWith("Hall show-a");
    // The fixture names a photo after its member, so the links are left out; real photo keys are random.
    const text = JSON.stringify({ ...body, members: body.members.map(({ photoUrl, ...rest }) => rest) });
    for (const who of s.members) expect(text).not.toContain(who.memberId);
  });

  test("a cafe the operator names replaces the fallback", async () => {
    const s = await setup();
    setCafe(s.t.db, s.groupId, { name: "Chai Point", address: "Road No 36", lat: 17.4, lng: 78.4 }, s.t.clock());
    await s.at(-3 * HOUR);
    const body = groupRevealedSchema.parse(await (await group(s, s.members[1] as Session)).json());
    expect(body.cafe).toEqual({ name: "Chai Point", address: "Road No 36", lat: 17.4, lng: 78.4, isFallback: false });
  });

  test("the photo route gives a link for a co-member and a 404 for an unknown ref", async () => {
    const s = await setup();
    await s.at(-3 * HOUR);
    const me = s.members[0] as Session;
    const body = groupRevealedSchema.parse(await (await group(s, me)).json());
    const other = s.t.db.query("SELECT member_ref FROM group_member WHERE member_id = ?").get((s.members[1] as Session).memberId) as {
      member_ref: string;
    };
    const response = await s.t.call("GET", `/groups/${s.groupId}/members/${other.member_ref}/photo`, { token: me.token });
    expect(response.status).toBe(200);
    expect(memberPhotoResponseSchema.parse(await response.json()).photo.url).toContain("/files/photos/");
    expect(body.members).toHaveLength(4);
    const unknown = await s.t.call("GET", `/groups/${s.groupId}/members/nobody/photo`, { token: me.token });
    expect(unknown.status).toBe(404);
  });

  test("the group and its photos close with the feedback window: the same 404 as a group that is not yours", async () => {
    const s = await setup();
    const closesAt = Date.parse(milestones(SHOW_START).feedbackClosesAt) - START;
    await s.at(closesAt - MINUTE);
    const me = s.members[0] as Session;
    const other = s.t.db.query("SELECT member_ref FROM group_member WHERE member_id = ?").get((s.members[1] as Session).memberId) as {
      member_ref: string;
    };
    expect((await group(s, me)).status).toBe(200);
    expect((await s.t.call("GET", `/groups/${s.groupId}/members/${other.member_ref}/photo`, { token: me.token })).status).toBe(200);
    await s.at(closesAt);
    expect((await group(s, me)).status).toBe(404);
    expect((await s.t.call("GET", `/groups/${s.groupId}/members/${other.member_ref}/photo`, { token: me.token })).status).toBe(404);
  });

  test("a member who withdrew is gone from everyone's list, and their ref is a 404", async () => {
    const s = await setup(5);
    await s.at(-3 * HOUR);
    const [me, leaver] = s.members as [Session, Session];
    const ref = (s.t.db.query("SELECT member_ref FROM group_member WHERE member_id = ?").get(leaver.memberId) as { member_ref: string })
      .member_ref;
    const plan = (await (await s.t.call("GET", "/plans", { token: leaver.token })).json()) as { plans: { id: string }[] };
    const withdrawn = await s.t.call("POST", `/plans/${plan.plans[0]?.id}/withdraw`, { token: leaver.token });
    expect(withdrawn.status).toBe(200);
    const body = groupRevealedSchema.parse(await (await group(s, me)).json());
    expect(body.members.map((m) => m.firstName)).not.toContain("Person1");
    expect(body.size).toBe(4);
    expect((await s.t.call("GET", `/groups/${s.groupId}/members/${ref}/photo`, { token: me.token })).status).toBe(404);
    expect((await group(s, leaver)).status).toBe(404);
  });
});

describe("POST /groups/:groupId/checkin", () => {
  const checkin = (s: Setup, who: Session, init: { body?: unknown; id?: string } = {}) =>
    s.t.call("POST", `/groups/${init.id ?? s.groupId}/checkin`, { token: who.token, body: init.body });

  test("is 409 outside_window before T-90m and after T+60m, and the caller can see why", async () => {
    const s = await setup();
    await s.at(-2 * HOUR);
    const early = await checkin(s, s.members[0] as Session);
    expect(early.status).toBe(409);
    expect((await errorOf(early)).code).toBe("outside_window");
    await s.at(61 * MINUTE);
    const late = await checkin(s, s.members[0] as Session);
    expect(late.status).toBe(409);
  });

  test("inside the window it marks the member, shows to the others, and is idempotent", async () => {
    const s = await setup();
    await s.at(-90 * MINUTE);
    const [me, other] = s.members as [Session, Session];
    const first = await checkin(s, me);
    expect(first.status).toBe(200);
    expect(checkinResponseSchema.parse(await first.json())).toEqual({ checkedIn: true });
    const stamp = (s.t.db.query("SELECT checked_in_at FROM group_member WHERE member_id = ?").get(me.memberId) as { checked_in_at: string })
      .checked_in_at;
    s.t.clock.advance(5 * MINUTE);
    expect((await checkin(s, me)).status).toBe(200);
    const again = (s.t.db.query("SELECT checked_in_at FROM group_member WHERE member_id = ?").get(me.memberId) as { checked_in_at: string })
      .checked_in_at;
    expect(again).toBe(stamp);
    const seen = groupRevealedSchema.parse(await (await group(s, other)).json());
    expect(seen.members.filter((m) => m.checkedIn).map((m) => m.firstName)).toEqual(["Person0"]);
  });

  test("a body with any field, such as coordinates, is 400 and nothing is stored", async () => {
    const s = await setup();
    await s.at(-90 * MINUTE);
    const me = s.members[0] as Session;
    const response = await checkin(s, me, { body: { lat: 17.4, lng: 78.4 } });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("invalid_request");
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM group_member WHERE checked_in_at IS NOT NULL").get()).toEqual({ n: 0 });
  });

  test("someone else's group and a made-up id are 404", async () => {
    const s = await setup();
    await s.at(-90 * MINUTE);
    const outsider = await memberSession(s.t, 9);
    expect((await checkin(s, outsider)).status).toBe(404);
    expect((await checkin(s, s.members[0] as Session, { id: "01hzzzzzzzzzzzzzzzzzzzzzzz" })).status).toBe(404);
  });

  test("the plan moves to meet_card_live and the group is live at T-90m", async () => {
    const s = await setup();
    await s.at(-90 * MINUTE);
    const plans = (await (await s.t.call("GET", "/plans", { token: (s.members[0] as Session).token })).json()) as { plans: unknown[] };
    const plan = planSchema.parse(plans.plans[0]);
    expect(plan.state).toBe("meet_card_live");
    expect(plan.group?.state).toBe("live");
  });
});
