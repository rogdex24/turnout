import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { banReason, isPhoneRefused } from "../src/social/bans.js";
import { eraseMember } from "../src/social/deletion.js";
import { getMember } from "../src/social/members.js";
import { type TestApp, testApp } from "./appHelpers.js";
import { memberSession, type Session } from "./helpers/appFixture.js";
import { type Setup, setup } from "./helpers/groupFixture.js";
import { seedShow, waitingPlan } from "./helpers/socialFixture.js";

const MINUTE = 60_000;
const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;

/** Puts a photo and a ticket file in the store for the member and points their rows at them, with keys the store accepts. */
async function storeFiles(t: TestApp, memberId: string, n: number): Promise<string[]> {
  const photo = `photos/file-${n}.jpg`;
  const ticket = `tickets/file-${n}/a.jpg`;
  t.db.query("UPDATE profile SET photo_key = ? WHERE member_id = ?").run(photo, memberId);
  t.db.query("UPDATE ticket_proof SET object_key = ? WHERE plan_id IN (SELECT id FROM plan WHERE member_id = ?)").run(ticket, memberId);
  await t.app.store.put(photo, new Uint8Array([1, 2, 3]), "image/jpeg");
  await t.app.store.put(ticket, new Uint8Array([4, 5, 6]), "image/jpeg");
  return [photo, ticket];
}

async function deleteCode(t: TestApp, who: Session): Promise<{ challengeId: string; code: string; expiresAt: string }> {
  const response = await t.call("POST", "/me/delete-code", { token: who.token });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { challengeId: string; expiresAt: string };
  return { ...body, code: t.sender.lastCode(who.phone) as string };
}

const confirm = (t: TestApp, who: Session, challengeId: string, code: string) =>
  t.call("DELETE", "/me", { token: who.token, body: { challengeId, code } });

/** Every table and column whose text holds the needle. */
function whereFound(t: TestApp, needle: string): string[] {
  const tables = t.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  const found: string[] = [];
  for (const { name } of tables) {
    const columns = t.db.query(`PRAGMA table_info(${name})`).all() as { name: string }[];
    for (const column of columns) {
      const row = t.db.query(`SELECT COUNT(*) AS n FROM ${name} WHERE CAST(${column.name} AS TEXT) LIKE ?`).get(`%${needle}%`) as {
        n: number;
      };
      if (row.n > 0) found.push(`${name}.${column.name}`);
    }
  }
  return found;
}

describe("POST /me/delete-code and DELETE /me", () => {
  test("a code goes to the member's own number and lives five minutes", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const sentBefore = t.sender.sent.length;
    const issued = await deleteCode(t, who);
    expect(t.sender.sent.length).toBe(sentBefore + 1);
    expect(t.sender.sent.at(-1)?.phone).toBe(who.phone);
    expect(Date.parse(issued.expiresAt) - t.clock().getTime()).toBe(5 * MINUTE);
    const row = t.db.query("SELECT purpose FROM otp_challenge WHERE id = ?").get(issued.challengeId);
    expect(row).toEqual({ purpose: "delete_account" });
    expect((await t.call("POST", "/me/delete-code", { token: who.token, body: { extra: 1 } })).status).toBe(400);
  });

  test("a sign-in challenge cannot confirm a deletion: 403, and the account stays", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const signIn = await t.call("POST", "/auth/otp", { body: { phone: who.phone, purpose: "sign_in" } });
    const { challengeId } = (await signIn.json()) as { challengeId: string };
    const code = t.sender.lastCode(who.phone) as string;
    const response = await confirm(t, who, challengeId, code);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("forbidden");
    expect(getMember(t.db, who.memberId)?.status).toBe("active");
  });

  test("a delete code cannot sign anyone in: /auth/otp/verify answers 400 and opens no session", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const sessions = () => (t.db.query("SELECT COUNT(*) AS n FROM auth_session WHERE member_id = ?").get(who.memberId) as { n: number }).n;
    const before = sessions();
    const issued = await deleteCode(t, who);
    const verify = await t.call("POST", "/auth/otp/verify", {
      body: { challengeId: issued.challengeId, phone: who.phone, code: issued.code, noticeVersion: NOTICE_VERSION },
    });
    expect(verify.status).toBe(400);
    expect((await errorOf(verify)).code).toBe("invalid_code");
    expect(sessions()).toBe(before);
    // The refused try did not spend the code: it still confirms the deletion.
    expect((await confirm(t, who, issued.challengeId, issued.code)).status).toBe(204);
  });

  test("a wrong, used, expired, unknown or someone else's code is a 400", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    const first = await deleteCode(t, a);
    const wrong = first.code === "000000" ? "000001" : "000000";
    expect((await confirm(t, a, first.challengeId, wrong)).status).toBe(400);
    expect((await confirm(t, b, first.challengeId, first.code)).status).toBe(400);
    expect((await confirm(t, a, "no-such-challenge", first.code)).status).toBe(400);
    // The wrong try above did not spend the code; five minutes and a second does.
    t.clock.set(new Date(t.clock().getTime() + 5 * MINUTE + 1000));
    const expired = await confirm(t, a, first.challengeId, first.code);
    expect(expired.status).toBe(400);
    expect((await errorOf(expired)).code).toBe("invalid_code");
    t.clock.set(new Date(t.clock().getTime() - 5 * MINUTE));
    const second = await deleteCode(t, a);
    expect((await confirm(t, a, second.challengeId, second.code)).status).toBe(204);
    const again = await t.call("DELETE", "/me", { token: a.token, body: { challengeId: second.challengeId, code: second.code } });
    expect(again.status).toBe(401);
    expect(getMember(t.db, b.memberId)?.status).toBe("active");
  });

  test("the body is strict", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const issued = await deleteCode(t, who);
    const response = await t.call("DELETE", "/me", {
      token: who.token,
      body: { challengeId: issued.challengeId, code: issued.code, why: "x" },
    });
    expect(response.status).toBe(400);
    expect(getMember(t.db, who.memberId)?.status).toBe("active");
  });

  test("the delete code is under the sign-in limits: a number asked too often gets a 429", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await t.call("POST", "/me/delete-code", { token: who.token })).status);
    expect(statuses).toContain(429);
  });

  test("after deletion the id, the phone and the handle are found only in the tombstone, consent and report rows", async () => {
    const s: Setup = await setup(5);
    const [gone, other] = s.members as [Session, Session];
    const files = await storeFiles(s.t, gone.memberId, 1);
    const handle = s.t.db.query("SELECT handle FROM social_handle WHERE member_id = ?").get(gone.memberId) as { handle: string };
    s.t.db
      .query(
        "INSERT INTO message (id, group_id, member_id, member_ref, client_id, body, created_at) VALUES ('m1', ?, ?, 'r', 'c1', 'hello', ?)",
      )
      .run(s.groupId, gone.memberId, s.t.clock().toISOString());
    s.t.db
      .query("INSERT INTO thread_presence (group_id, member_id, seen_at) VALUES (?, ?, ?)")
      .run(s.groupId, gone.memberId, s.t.clock().toISOString());
    s.t.db
      .query("INSERT INTO downvote (id, group_id, voter_id, target_id, created_at) VALUES ('d1', ?, ?, ?, ?)")
      .run(s.groupId, other.memberId, gone.memberId, s.t.clock().toISOString());
    const [a, b] = [gone.memberId, other.memberId].sort() as [string, string];
    s.t.db
      .query("INSERT INTO met_edge (group_id, member_a, member_b, created_at) VALUES (?, ?, ?, ?)")
      .run(s.groupId, a, b, s.t.clock().toISOString());
    s.t.db
      .query(
        "INSERT INTO device (id, member_id, expo_token, platform, created_at, last_seen_at) VALUES ('dev1', ?, 'ExponentPushToken[abcdefgh1234]', 'ios', ?, ?)",
      )
      .run(gone.memberId, s.t.clock().toISOString(), s.t.clock().toISOString());
    expect(whereFound(s.t, gone.memberId).length).toBeGreaterThan(3);

    const issued = await deleteCode(s.t, gone);
    expect((await confirm(s.t, gone, issued.challengeId, issued.code)).status).toBe(204);

    // The audit trail names the tombstone id (and a code, never a handle or a name) for its year, so it stays.
    const allowed = new Set(["member.id", "consent_record.member_id", "operator_action.subject_id"]);
    for (const needle of [gone.memberId, gone.phone, gone.phone.slice(1), handle.handle, "Person0"]) {
      const places = whereFound(s.t, needle).filter((place) => !allowed.has(place) && !place.startsWith("report."));
      expect(places).toEqual([]);
    }
    expect(getMember(s.t.db, gone.memberId)).toMatchObject({ status: "deleted", status_reason: "self", phone_e164: null });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM consent_record WHERE member_id = ?").get(gone.memberId)).toEqual({ n: 1 });
    for (const key of files) expect(await s.t.app.store.get(key)).toBeNull();
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 0 });
  });

  test("the group is told someone left, and not who", async () => {
    const s = await setup(5);
    const [gone, other] = s.members as [Session, Session];
    const before = s.t.db.query("SELECT COUNT(*) AS n FROM notice WHERE member_id = ?").get(other.memberId) as { n: number };
    const issued = await deleteCode(s.t, gone);
    expect((await confirm(s.t, gone, issued.challengeId, issued.code)).status).toBe(204);
    const after = s.t.db.query("SELECT COUNT(*) AS n FROM notice WHERE member_id = ?").get(other.memberId) as { n: number };
    expect(after.n).toBe(before.n + 1);
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND left_at IS NULL").get(s.groupId)).toEqual({ n: 4 });
    const group = await s.t.call("GET", `/groups/${s.groupId}`, { token: other.token });
    expect(JSON.stringify(await group.json())).not.toContain("Person0");
  });

  test("every token stops working", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const issued = await deleteCode(t, who);
    expect((await confirm(t, who, issued.challengeId, issued.code)).status).toBe(204);
    expect((await t.call("GET", "/me", { token: who.token })).status).toBe(401);
  });

  test("the same number signs up fresh after a deletion, with no ban row", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const issued = await deleteCode(t, who);
    expect((await confirm(t, who, issued.challengeId, issued.code)).status).toBe(204);
    const again = await t.signIn(who.phone);
    const me = await t.call("GET", "/me", { token: again.accessToken });
    expect(me.status).toBe(200);
    const row = t.db.query("SELECT id, status FROM member WHERE phone_e164 = ?").get(who.phone) as { id: string; status: string };
    expect(row.id).not.toBe(who.memberId);
    expect(row.status).toBe("active");
    expect(banReason(t.db, t.app.config.banPepper, who.phone)).toBeNull();
  });

  test("a member with a plan in a locked group deletes through the loss rule", async () => {
    const s = await setup(5);
    await s.at(-23 * 3_600_000);
    const [gone] = s.members as [Session];
    const result = eraseMember(s.t.db, gone.memberId, { kind: "self" }, s.t.clock(), s.t.app.config.tunables);
    expect(result.ok).toBe(true);
    expect(s.t.db.query("SELECT state FROM show_group WHERE id = ?").get(s.groupId)).toEqual({ state: "locked" });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM plan WHERE member_id = ?").get(gone.memberId)).toEqual({ n: 0 });
  });
});

describe("eraseMember with a ban", () => {
  test("it writes one ban row with no member id, erases the account and refuses the number at sign-in", async () => {
    const t = await testApp();
    seedShow(t.db, { id: "show-y" });
    const who = await memberSession(t, 0);
    waitingPlan(t.db, who.memberId, "show-y", t.clock());
    const files = await storeFiles(t, who.memberId, 2);
    const result = eraseMember(
      t.db,
      who.memberId,
      { kind: "ban", pepper: t.app.config.banPepper, reason: "report_upheld" },
      t.clock(),
      t.app.config.tunables,
    );
    expect(result).toEqual({ ok: true, fileKeys: expect.arrayContaining(files) });
    expect(t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 1 });
    expect(isPhoneRefused(t.db, t.app.config.banPepper, who.phone)).toBe(true);
    expect(getMember(t.db, who.memberId)).toMatchObject({ status: "deleted", status_reason: "ban", phone_e164: null });
    const refused = await t.call("POST", "/auth/otp", { body: { phone: who.phone, purpose: "sign_in" } });
    expect(refused.status).toBe(403);
    expect((await errorOf(refused)).code).toBe("sign_in_unavailable");
  });

  test("a second erase of the same member changes nothing", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    expect(eraseMember(t.db, who.memberId, { kind: "self" }, t.clock()).ok).toBe(true);
    expect(eraseMember(t.db, who.memberId, { kind: "self" }, t.clock())).toEqual({ ok: false, error: "not_found" });
  });

  test("a plan waiting for a group is withdrawn with the reason banned before it is removed", async () => {
    const t = await testApp();
    seedShow(t.db, { id: "show-x" });
    const who = await memberSession(t, 0);
    waitingPlan(t.db, who.memberId, "show-x", t.clock());
    expect(eraseMember(t.db, who.memberId, { kind: "ban", pepper: t.app.config.banPepper, reason: "operator" }, t.clock()).ok).toBe(true);
    expect(t.db.query("SELECT COUNT(*) AS n FROM plan WHERE member_id = ?").get(who.memberId)).toEqual({ n: 0 });
  });
});

describe("a suspended member's own deletion", () => {
  test("a member suspended by a report can still ask for a delete code and delete; the open report stays", async () => {
    const s: Setup = await setup(5);
    const [a, b] = s.members as [Session, Session];
    await s.at(-3 * 3_600_000);
    const ref = (
      s.t.db.query("SELECT member_ref AS ref FROM group_member WHERE group_id = ? AND member_id = ?").get(s.groupId, b.memberId) as {
        ref: string;
      }
    ).ref;
    const reported = await s.t.call("POST", "/reports", {
      token: a.token,
      body: { groupId: s.groupId, memberRef: ref, body: "They made me uncomfortable.", clientId: "client-000001" },
    });
    expect(reported.status).toBe(201);
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");
    // The suspension signed them out, and every other route still says why; these two are let through.
    expect((await s.t.call("GET", "/me", { token: b.token })).status).toBe(403);
    const issued = await deleteCode(s.t, b);
    expect((await confirm(s.t, b, issued.challengeId, issued.code)).status).toBe(204);
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "deleted", phone_e164: null });
    expect(s.t.db.query("SELECT status FROM report WHERE subject_id = ?").all(b.memberId)).toEqual([{ status: "open" }]);
  });
});
