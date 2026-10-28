import { describe, expect, test } from "bun:test";
import { banHash, banReason, isPhoneRefused, removeBan, writeBan } from "../src/social/bans.js";
import { getMemberByPhone } from "../src/social/members.js";
import { PHONES, testApp } from "./appHelpers.js";

const PEPPER = "a-test-ban-pepper-0123456789abcdef";
const NOW = new Date("2026-10-27T06:00:00Z");

async function setup() {
  const t = await testApp();
  return { t, pepper: t.app.config.banPepper };
}

async function requestCode(t: Awaited<ReturnType<typeof testApp>>, phone: string) {
  return t.call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" } });
}

describe("ban list", () => {
  test("the hash is HMAC-SHA256 of the E.164 number, keyed by the pepper, and differs by pepper", () => {
    const hash = banHash(PEPPER, PHONES[0] as string);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain((PHONES[0] as string).slice(1));
    expect(banHash("another-pepper-0123456789abcdef0123", PHONES[0] as string)).not.toBe(hash);
    expect(banHash(PEPPER, PHONES[0] as string)).toBe(hash);
  });

  test("a row holds a hash, a reason and a time, and no user id", async () => {
    const { t } = await setup();
    writeBan(t.db, PEPPER, PHONES[0] as string, "operator", NOW);
    const columns = (t.db.query("PRAGMA table_info(ban_list)").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(["phone_hash", "reason", "created_at"]);
    expect(t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 1 });
  });

  test("a second write for the same number changes nothing, except a stop moving up to a ban", async () => {
    const { t } = await setup();
    const phone = PHONES[0] as string;
    expect(writeBan(t.db, PEPPER, phone, "downvote_stop", NOW)).toBe(true);
    expect(writeBan(t.db, PEPPER, phone, "downvote_stop", NOW)).toBe(false);
    expect(writeBan(t.db, PEPPER, phone, "report_upheld", NOW)).toBe(true);
    expect(banReason(t.db, PEPPER, phone)).toBe("report_upheld");
    expect(writeBan(t.db, PEPPER, phone, "downvote_stop", NOW)).toBe(false);
    expect(writeBan(t.db, PEPPER, phone, "operator", NOW)).toBe(false);
    expect(t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 1 });
  });

  test("only report_upheld and operator refuse; a stop does not", async () => {
    const { t } = await setup();
    const [a, b, c] = [PHONES[0], PHONES[1], PHONES[2]] as string[];
    writeBan(t.db, PEPPER, a as string, "report_upheld", NOW);
    writeBan(t.db, PEPPER, b as string, "downvote_stop", NOW);
    writeBan(t.db, PEPPER, c as string, "operator", NOW);
    expect(isPhoneRefused(t.db, PEPPER, a as string)).toBe(true);
    expect(isPhoneRefused(t.db, PEPPER, b as string)).toBe(false);
    expect(isPhoneRefused(t.db, PEPPER, c as string)).toBe(true);
    expect(isPhoneRefused(t.db, PEPPER, PHONES[3] as string)).toBe(false);
  });

  test("a banned number is refused at request: the generic answer, no send, no challenge", async () => {
    const { t, pepper } = await setup();
    const phone = PHONES[0] as string;
    writeBan(t.db, pepper, phone, "report_upheld", t.clock());
    const response = await requestCode(t, phone);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("sign_in_unavailable");
    expect(t.sender.sent).toHaveLength(0);
    expect(t.db.query("SELECT COUNT(*) AS n FROM otp_challenge").get()).toEqual({ n: 0 });
  });

  test("a number banned after the code was sent is refused at verify, with no session and no member", async () => {
    const { t, pepper } = await setup();
    const phone = PHONES[0] as string;
    const requested = await requestCode(t, phone);
    const { challengeId } = (await requested.json()) as { challengeId: string };
    const code = t.sender.lastCode(phone);
    writeBan(t.db, pepper, phone, "operator", t.clock());
    const verified = await t.call("POST", "/auth/otp/verify", { body: { challengeId, phone, code, noticeVersion: "2026-10-26" } });
    expect(verified.status).toBe(403);
    expect(((await verified.json()) as { error: { code: string } }).error.code).toBe("sign_in_unavailable");
    expect(getMemberByPhone(t.db, phone)).toBeNull();
    expect(t.db.query("SELECT COUNT(*) AS n FROM auth_session").get()).toEqual({ n: 0 });
  });

  test("lifting a ban lets the number sign up", async () => {
    const { t, pepper } = await setup();
    const phone = PHONES[0] as string;
    writeBan(t.db, pepper, phone, "report_upheld", t.clock());
    expect((await requestCode(t, phone)).status).toBe(403);
    expect(removeBan(t.db, pepper, phone)).toBe(true);
    expect(removeBan(t.db, pepper, phone)).toBe(false);
    const tokens = await t.signIn(phone);
    expect(tokens.accessToken.length).toBeGreaterThan(20);
    expect(getMemberByPhone(t.db, phone)?.status).toBe("active");
  });

  test("a stopped number signs up as a stopped member who can still sign in", async () => {
    const { t, pepper } = await setup();
    const phone = PHONES[0] as string;
    writeBan(t.db, pepper, phone, "downvote_stop", t.clock());
    const tokens = await t.signIn(phone);
    const member = getMemberByPhone(t.db, phone);
    expect(member?.status).toBe("stopped");
    expect(member?.status_reason).toBe("downvote_stop");
    const me = await t.call("GET", "/me", { token: tokens.accessToken });
    expect(me.status).toBe(200);
  });
});
