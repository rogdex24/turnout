import { describe, expect, spyOn, test } from "bun:test";
import { createHmac, createSecretKey } from "node:crypto";
import { tokenPairSchema } from "@turnout/contract/app/auth";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { SignJWT } from "jose";
import { checkOtpSpend, OTP_SENDS_KEY } from "../src/app-api/alerts.js";
import { clientIp } from "../src/app-api/http.js";
import { generateCode } from "../src/app-api/otp.js";
import { windowFor } from "../src/app-api/rateLimit.js";
import { hashRefreshToken } from "../src/app-api/tokens.js";
import { indianMobile, PHONES, REVIEWER_CODE, REVIEWER_PHONE, testApp } from "./appHelpers.js";

const NOTICE = "2026-10-26";

async function errorOf(response: Response): Promise<{ status: number; code: string }> {
  const body = errorBodySchema.parse(await response.json());
  return { status: response.status, code: body.error.code };
}

describe("code request", () => {
  test("a good request makes a challenge, sends once and stores no code or raw phone", async () => {
    const t = await testApp();
    const response = await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { challengeId: string; expiresAt: string };
    expect(body.expiresAt).toBe("2026-10-27T06:10:00.000Z");
    expect(t.sender.sent).toHaveLength(1);
    const code = t.sender.sent[0]?.code as string;
    expect(code).toMatch(/^\d{6}$/);
    const rows = t.db.query("SELECT * FROM otp_challenge").all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(code);
    expect(dump).not.toContain(String(PHONES[0]).slice(1));
    expect(dump).not.toContain(String(PHONES[0]));
    const expected = createHmac("sha256", t.app.config.otpPepper).update(`${body.challengeId}${code}`).digest("hex");
    expect(rows[0]?.code_hmac).toBe(expected);
    // The counters hold keyed hashes, not the number or the address.
    const buckets = JSON.stringify(t.db.query("SELECT bucket_key FROM rate_bucket").all());
    expect(buckets).not.toContain(String(PHONES[0]).slice(2));
  });

  test("the code is 6 digits and spread over all digits", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
      seen.add(code[0] as string);
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  test("a random value past the last whole multiple of a million is thrown away, not folded onto a digit", () => {
    const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
    const draws = [limit, 2 ** 32 - 1, limit - 1];
    const spy = spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
      array[0] = draws.shift() as number;
      return array;
    }) as typeof crypto.getRandomValues);
    try {
      expect(generateCode()).toBe(String((limit - 1) % 1_000_000).padStart(6, "0"));
      expect(draws).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test("a +91 mobile and an allowlisted number are accepted; a landline, a foreign number and junk are bad_phone", async () => {
    const t = await testApp();
    expect((await t.call("POST", "/auth/otp", { body: { phone: indianMobile(), purpose: "sign_in" } })).status).toBe(200);
    for (const phone of ["+442071838750", "+912227000000", "not a phone", "+12025550177"]) {
      const response = await t.call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" } });
      expect(await errorOf(response)).toEqual({ status: 400, code: "bad_phone" });
    }
    expect(t.sender.sent).toHaveLength(1);
  });

  test("a bad body is a 400 that names the field", async () => {
    const t = await testApp();
    const response = await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "other" } });
    expect(response.status).toBe(400);
    const body = errorBodySchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("purpose");
    const extra = await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in", admin: true } });
    expect((await extra.json()) as unknown).toEqual({ error: { code: "invalid_request", message: "admin: unknown field" } });
  });

  test("an earlier code stops working when a new one is asked for", async () => {
    const t = await testApp();
    const first = (await (await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } })).json()) as {
      challengeId: string;
    };
    const firstCode = t.sender.lastCode(PHONES[0] as string) as string;
    await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } });
    const response = await t.call("POST", "/auth/otp/verify", {
      body: { challengeId: first.challengeId, phone: PHONES[0], code: firstCode, noticeVersion: NOTICE },
    });
    expect(await errorOf(response)).toEqual({ status: 400, code: "invalid_code" });
  });

  test("a banned number gets the generic refusal before anything is sent or counted", async () => {
    const t = await testApp();
    await t.signIn(PHONES[1] as string);
    t.db.query("UPDATE member SET status = 'banned' WHERE phone_e164 = ?").run(PHONES[1] as string);
    const sent = t.sender.sent.length;
    const buckets = (t.db.query("SELECT COUNT(*) AS n FROM rate_bucket").get() as { n: number }).n;
    const response = await t.call("POST", "/auth/otp", { body: { phone: PHONES[1], purpose: "sign_in" } });
    expect(await errorOf(response)).toEqual({ status: 403, code: "sign_in_unavailable" });
    expect(t.sender.sent).toHaveLength(sent);
    expect((t.db.query("SELECT COUNT(*) AS n FROM rate_bucket").get() as { n: number }).n).toBe(buckets);
  });

  test("per phone: the 4th request in 15 minutes is a 429 with Retry-After, and it resets", async () => {
    const t = await testApp();
    for (let i = 0; i < 3; i++)
      expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[2], purpose: "sign_in" } })).status).toBe(200);
    const refused = await t.call("POST", "/auth/otp", { body: { phone: PHONES[2], purpose: "sign_in" } });
    expect(await errorOf(refused.clone())).toEqual({ status: 429, code: "rate_limited" });
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(t.sender.sent).toHaveLength(3);
    t.clock.advance(15 * 60 * 1000);
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[2], purpose: "sign_in" } })).status).toBe(200);
  });

  test("per phone: the 11th request in an IST day is a 429", async () => {
    const t = await testApp();
    for (let i = 0; i < 10; i++) {
      expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[3], purpose: "sign_in" } })).status).toBe(200);
      t.clock.advance(16 * 60 * 1000);
    }
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[3], purpose: "sign_in" } })).status).toBe(429);
  });

  test("per address: the 6th request in a minute and the 31st in a day are 429s, whatever the number", async () => {
    const t = await testApp();
    for (let i = 0; i < 5; i++)
      expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[i + 4], purpose: "sign_in" }, ip: "198.51.100.7" })).status).toBe(
        200,
      );
    const sixth = await t.call("POST", "/auth/otp", { body: { phone: PHONES[10], purpose: "sign_in" }, ip: "198.51.100.7" });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).not.toBeNull();
    // Another address is not affected.
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[10], purpose: "sign_in" }, ip: "198.51.100.8" })).status).toBe(200);

    const u = await testApp();
    // 30 in a day from one address, one minute apart; the 31st fails.
    for (let i = 0; i < 30; i++) {
      u.clock.advance(61 * 1000);
      const response = await u.call("POST", "/auth/otp", { body: { phone: PHONES[i % 20], purpose: "sign_in" }, ip: "198.51.100.9" });
      expect(response.status).toBe(200);
    }
    u.clock.advance(61 * 1000);
    const over = await u.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" }, ip: "198.51.100.9" });
    expect(over.status).toBe(429);
  });

  test("a refused request does not use up the other limits", async () => {
    const t = await testApp();
    for (let i = 0; i < 3; i++) await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" }, ip: "203.0.113.5" });
    // Refused by the phone limit; the address has only been used 3 times, so 2 more are left, not 1.
    await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" }, ip: "203.0.113.5" });
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[1], purpose: "sign_in" }, ip: "203.0.113.5" })).status).toBe(200);
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[2], purpose: "sign_in" }, ip: "203.0.113.5" })).status).toBe(200);
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[3], purpose: "sign_in" }, ip: "203.0.113.5" })).status).toBe(429);
  });

  test("the 201st send of the day is refused with otp_cap_reached and an alert; the reviewer still gets in", async () => {
    const t = await testApp({ env: { OTP_DAILY_CAP: "3" } });
    for (let i = 0; i < 3; i++)
      expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[i], purpose: "sign_in" } })).status).toBe(200);
    const refused = await t.call("POST", "/auth/otp", { body: { phone: PHONES[3], purpose: "sign_in" } });
    expect(await errorOf(refused.clone())).toEqual({ status: 503, code: "otp_cap_reached" });
    expect(refused.headers.get("retry-after")).not.toBeNull();
    expect(t.alerts.sent.map((a) => a.kind)).toContain("otp_daily_cap");
    expect(t.sender.sent).toHaveLength(3);
    expect((await t.call("POST", "/auth/otp", { body: { phone: REVIEWER_PHONE, purpose: "sign_in" } })).status).toBe(200);
    // The next IST day starts fresh.
    t.clock.set("2026-10-28T00:00:00Z");
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[3], purpose: "sign_in" } })).status).toBe(200);
  });

  test("the default cap is 200", async () => {
    const t = await testApp();
    expect(t.app.config.tunables.otp.dailyCap).toBe(200);
    const { start } = windowFor("ist_day", t.clock());
    t.db
      .query("INSERT INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, 86400, 200)")
      .run(OTP_SENDS_KEY, start);
    const refused = await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } });
    expect(await errorOf(refused)).toEqual({ status: 503, code: "otp_cap_reached" });
  });

  test("a send failure is a 503 otp_send_failed, the code is dead, and 131042 alerts the operator", async () => {
    const t = await testApp();
    t.sender.failWith = "131042";
    const response = await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } });
    expect(await errorOf(response)).toEqual({ status: 503, code: "otp_send_failed" });
    expect(t.alerts.sent.map((a) => a.kind)).toContain("whatsapp_131042");
    const row = t.db.query("SELECT delivery_status, delivery_error_code, voided_at FROM otp_challenge").get() as Record<
      string,
      string | null
    >;
    expect(row.delivery_status).toBe("failed");
    expect(row.delivery_error_code).toBe("131042");
    expect(row.voided_at).not.toBeNull();
    // No alert text holds the number.
    for (const alert of t.alerts.sent) expect(alert.text).not.toContain(PHONES[0] as string);
  });

  test("the reviewer number gets the fixed code, no message, and status delivered", async () => {
    const t = await testApp();
    const requested = await t.call("POST", "/auth/otp", { body: { phone: REVIEWER_PHONE, purpose: "sign_in" } });
    const { challengeId } = (await requested.json()) as { challengeId: string };
    expect(t.sender.sent).toHaveLength(0);
    const row = t.db.query("SELECT delivery_status FROM otp_challenge").get() as { delivery_status: string };
    expect(row.delivery_status).toBe("reviewer");
    const status = await t.call("GET", `/auth/otp/${challengeId}`);
    expect(((await status.json()) as { deliveryStatus: string }).deliveryStatus).toBe("delivered");
    const verified = await t.call("POST", "/auth/otp/verify", {
      body: { challengeId, phone: REVIEWER_PHONE, code: REVIEWER_CODE, noticeVersion: NOTICE },
    });
    expect(verified.status).toBe(200);
    // The reviewer is exempt from the per phone limit.
    for (let i = 0; i < 4; i++)
      expect((await t.call("POST", "/auth/otp", { body: { phone: REVIEWER_PHONE, purpose: "sign_in" } })).status).toBe(200);
  });

  test("the reviewer number's wrong tries are capped at 20 a day; after that even the right code is refused until the next IST day", async () => {
    const t = await testApp();
    const body = (code: string, challengeId: string) => ({ challengeId, phone: REVIEWER_PHONE, code, noticeVersion: NOTICE });
    const challenge = async (n: number): Promise<string> => {
      const res = await t.call("POST", "/auth/otp", { body: { phone: REVIEWER_PHONE, purpose: "sign_in" }, ip: `198.51.100.${n}` });
      expect(res.status).toBe(200);
      return ((await res.json()) as { challengeId: string }).challengeId;
    };
    // 4 challenges of 5 wrong tries each: 20 wrong codes.
    for (let n = 0; n < 4; n++) {
      const id = await challenge(n);
      for (let i = 0; i < 5; i++)
        expect((await errorOf(await t.call("POST", "/auth/otp/verify", { body: body("000000", id) }))).code).toBe("invalid_code");
    }
    // A fresh challenge and the right code: refused, and the challenge is left unused.
    const id = await challenge(10);
    const refused = await t.call("POST", "/auth/otp/verify", { body: body(REVIEWER_CODE, id) });
    expect(await errorOf(refused)).toEqual({ status: 400, code: "invalid_code" });
    expect(
      (t.db.query("SELECT consumed_at FROM otp_challenge WHERE id = ?").get(id) as { consumed_at: string | null }).consumed_at,
    ).toBeNull();
    expect(t.alerts.sent.map((a) => a.kind)).toContain("otp_reviewer_locked");
    // An ordinary number is not touched by the reviewer's cap.
    expect((await t.signIn(PHONES[0] as string)).accessToken).toBeString();
    // The next IST day a new code works again.
    t.clock.advance(24 * 60 * 60 * 1000);
    const next = await challenge(11);
    expect((await t.call("POST", "/auth/otp/verify", { body: body(REVIEWER_CODE, next) })).status).toBe(200);
  });

  test("the status route shows sent, then what the webhook reported; unknown and expired are 404", async () => {
    const t = await testApp();
    const { challengeId } = (await (await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } })).json()) as {
      challengeId: string;
    };
    expect(((await (await t.call("GET", `/auth/otp/${challengeId}`)).json()) as { deliveryStatus: string }).deliveryStatus).toBe("sent");
    expect((await t.call("GET", "/auth/otp/nonexistent")).status).toBe(404);
    t.clock.advance(11 * 60 * 1000);
    expect((await t.call("GET", `/auth/otp/${challengeId}`)).status).toBe(404);
  });
});

describe("verify", () => {
  test("a right code creates the member and the first consent once; the second sign-in adds neither", async () => {
    const t = await testApp();
    const first = await t.signIn(PHONES[0] as string);
    expect(tokenPairSchema.safeParse({ ...first, challengeId: undefined }).success).toBe(true);
    expect((t.db.query("SELECT COUNT(*) AS n FROM member").get() as { n: number }).n).toBe(1);
    const consent = t.db.query("SELECT notice_version, purpose FROM consent_record").all();
    expect(consent).toEqual([{ notice_version: NOTICE, purpose: "service" }]);
    const member = t.db.query("SELECT phone_verified_at, status FROM member").get() as { phone_verified_at: string; status: string };
    expect(member.status).toBe("active");
    expect(member.phone_verified_at).toBe("2026-10-27T06:00:00.000Z");
    expect(t.db.query("SELECT COUNT(*) AS n FROM profile").get()).toEqual({ n: 1 });
    t.clock.advance(60 * 60 * 1000);
    await t.signIn(PHONES[0] as string);
    expect((t.db.query("SELECT COUNT(*) AS n FROM member").get() as { n: number }).n).toBe(1);
    expect((t.db.query("SELECT COUNT(*) AS n FROM consent_record").get() as { n: number }).n).toBe(1);
    expect((t.db.query("SELECT COUNT(*) AS n FROM auth_session").get() as { n: number }).n).toBe(2);
  });

  test("a wrong code 5 times kills the challenge, even for the right code afterwards", async () => {
    const t = await testApp();
    const { challengeId } = (await (await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } })).json()) as {
      challengeId: string;
    };
    const right = t.sender.lastCode(PHONES[0] as string) as string;
    const wrong = right === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      const response = await t.call("POST", "/auth/otp/verify", {
        body: { challengeId, phone: PHONES[0], code: wrong, noticeVersion: NOTICE },
      });
      expect(await errorOf(response)).toEqual({ status: 400, code: "invalid_code" });
    }
    const late = await t.call("POST", "/auth/otp/verify", { body: { challengeId, phone: PHONES[0], code: right, noticeVersion: NOTICE } });
    expect(await errorOf(late)).toEqual({ status: 400, code: "invalid_code" });
    expect((t.db.query("SELECT COUNT(*) AS n FROM member").get() as { n: number }).n).toBe(0);
  });

  test("a code works once, expires after 10 minutes, and is not good for another number", async () => {
    const t = await testApp();
    const { challengeId } = (await (await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } })).json()) as {
      challengeId: string;
    };
    const code = t.sender.lastCode(PHONES[0] as string) as string;
    const other = await t.call("POST", "/auth/otp/verify", { body: { challengeId, phone: PHONES[1], code, noticeVersion: NOTICE } });
    expect((await errorOf(other)).code).toBe("invalid_code");
    const good = await t.call("POST", "/auth/otp/verify", { body: { challengeId, phone: PHONES[0], code, noticeVersion: NOTICE } });
    expect(good.status).toBe(200);
    const again = await t.call("POST", "/auth/otp/verify", { body: { challengeId, phone: PHONES[0], code, noticeVersion: NOTICE } });
    expect((await errorOf(again)).code).toBe("invalid_code");

    const second = (await (await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } })).json()) as {
      challengeId: string;
    };
    const secondCode = t.sender.lastCode(PHONES[0] as string) as string;
    t.clock.advance(10 * 60 * 1000 + 1000);
    const late = await t.call("POST", "/auth/otp/verify", {
      body: { challengeId: second.challengeId, phone: PHONES[0], code: secondCode, noticeVersion: NOTICE },
    });
    expect((await errorOf(late)).code).toBe("invalid_code");
  });

  test("an unknown notice version is refused first", async () => {
    const t = await testApp();
    const response = await t.call("POST", "/auth/otp/verify", {
      body: { challengeId: "x", phone: PHONES[0], code: "123456", noticeVersion: "1999-01-01" },
    });
    expect(await errorOf(response)).toEqual({ status: 400, code: "unknown_notice_version" });
  });

  test("a suspended member gets 403 account_suspended; a stopped member signs in normally", async () => {
    const t = await testApp();
    await t.signIn(PHONES[0] as string);
    await t.signIn(PHONES[1] as string);
    t.db.query("UPDATE member SET status = 'suspended' WHERE phone_e164 = ?").run(PHONES[0] as string);
    t.db.query("UPDATE member SET status = 'stopped' WHERE phone_e164 = ?").run(PHONES[1] as string);
    await expect(t.signIn(PHONES[0] as string)).rejects.toThrow("verify answered 403");
    const stopped = await t.signIn(PHONES[1] as string);
    const me = await t.call("GET", "/me", { token: stopped.accessToken });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { status: string }).status).toBe("stopped");
  });
});

describe("sessions", () => {
  test("the access token is an ES256 JWT with sub and sid that lasts 15 minutes", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    const [header, payload] = tokens.accessToken
      .split(".")
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part as string, "base64url").toString())) as [Record<string, string>, Record<string, unknown>];
    expect(header.alg).toBe("ES256");
    const member = t.db.query("SELECT id FROM member").get() as { id: string };
    const session = t.db.query("SELECT id FROM auth_session").get() as { id: string };
    expect(payload.sub).toBe(member.id);
    expect(payload.sid).toBe(session.id);
    expect((payload.exp as number) - (payload.iat as number)).toBe(15 * 60);
    expect((await t.call("GET", "/me", { token: tokens.accessToken })).status).toBe(200);
    t.clock.advance(15 * 60 * 1000 + 1000);
    expect((await t.call("GET", "/me", { token: tokens.accessToken })).status).toBe(401);
  });

  test("a banned member cannot refresh, and the session is closed", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    t.db.query("UPDATE member SET status = 'banned'").run();
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } })).status).toBe(401);
    const row = t.db.query("SELECT revoked_at FROM auth_session").get() as { revoked_at: string | null };
    expect(row.revoked_at).not.toBeNull();
  });

  test("the refresh token is stored only as a hash", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    const row = t.db.query("SELECT refresh_hash FROM auth_session").get() as { refresh_hash: string };
    expect(row.refresh_hash).toBe(hashRefreshToken(tokens.refreshToken));
    expect(row.refresh_hash).not.toBe(tokens.refreshToken);
    expect(Buffer.from(tokens.refreshToken, "base64url")).toHaveLength(32);
  });

  test("refresh rotates, slides the 30 days, and the old token is reuse: it signs every session out", async () => {
    const t = await testApp();
    const first = await t.signIn(PHONES[0] as string);
    const otherDevice = await t.signIn(PHONES[0] as string);
    t.clock.advance(20 * 24 * 60 * 60 * 1000);
    const refreshed = await t.call("POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(refreshed.status).toBe(200);
    const second = tokenPairSchema.parse(await refreshed.json());
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.refreshExpiresAt).toBe("2026-12-16T06:00:00.000Z");
    // 45 days after sign-in, still good because it slid.
    t.clock.advance(25 * 24 * 60 * 60 * 1000);
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: second.refreshToken } })).status).toBe(200);
    // The first token was already used: reuse.
    const reuse = await t.call("POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(await errorOf(reuse)).toEqual({ status: 401, code: "unauthorized" });
    const open = t.db.query("SELECT COUNT(*) AS n FROM auth_session WHERE revoked_at IS NULL").get() as { n: number };
    expect(open.n).toBe(0);
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: otherDevice.refreshToken } })).status).toBe(401);
  });

  describe("refresh grace window", () => {
    const refresh = (t: Awaited<ReturnType<typeof testApp>>, refreshToken: string) =>
      t.call("POST", "/auth/refresh", { body: { refreshToken } });
    const openSessions = (t: Awaited<ReturnType<typeof testApp>>) =>
      (t.db.query("SELECT COUNT(*) AS n FROM auth_session WHERE revoked_at IS NULL").get() as { n: number }).n;

    test("a repeat of the just-rotated token inside the window rotates the chain again and keeps every session", async () => {
      const t = await testApp();
      const first = await t.signIn(PHONES[0] as string);
      await t.signIn(PHONES[0] as string);
      // The response to this refresh never reaches the phone.
      const lost = tokenPairSchema.parse(await (await refresh(t, first.refreshToken)).json());
      t.clock.advance(10 * 1000);
      const retry = await refresh(t, first.refreshToken);
      expect(retry.status).toBe(200);
      const fresh = tokenPairSchema.parse(await retry.json());
      expect(fresh.refreshToken).not.toBe(first.refreshToken);
      expect(fresh.refreshToken).not.toBe(lost.refreshToken);
      // The replacement the phone never saw is revoked; the other device and the fresh session are still open.
      const lostRow = t.db.query("SELECT revoked_at FROM auth_session WHERE refresh_hash = ?").get(hashRefreshToken(lost.refreshToken)) as {
        revoked_at: string | null;
      };
      expect(lostRow.revoked_at).not.toBeNull();
      expect(openSessions(t)).toBe(2);
    });

    test("the retry leaves the other device and the fresh pair signed in", async () => {
      const t = await testApp();
      const first = await t.signIn(PHONES[0] as string);
      const otherDevice = await t.signIn(PHONES[0] as string);
      await refresh(t, first.refreshToken);
      t.clock.advance(10 * 1000);
      const fresh = tokenPairSchema.parse(await (await refresh(t, first.refreshToken)).json());
      // Open: the other device and the fresh session.
      expect(openSessions(t)).toBe(2);
      expect((await refresh(t, otherDevice.refreshToken)).status).toBe(200);
      expect((await refresh(t, fresh.refreshToken)).status).toBe(200);
    });

    test("a repeat after the window is reuse and signs every session out", async () => {
      const t = await testApp();
      const first = await t.signIn(PHONES[0] as string);
      const otherDevice = await t.signIn(PHONES[0] as string);
      await refresh(t, first.refreshToken);
      t.clock.advance((t.app.config.tunables.session.refreshGraceSeconds + 1) * 1000);
      expect(await errorOf(await refresh(t, first.refreshToken))).toEqual({ status: 401, code: "unauthorized" });
      expect(openSessions(t)).toBe(0);
      expect((await refresh(t, otherDevice.refreshToken)).status).toBe(401);
    });

    test("a repeat inside the window is still reuse once the replacement has been used", async () => {
      const t = await testApp();
      const first = await t.signIn(PHONES[0] as string);
      const otherDevice = await t.signIn(PHONES[0] as string);
      const second = tokenPairSchema.parse(await (await refresh(t, first.refreshToken)).json());
      t.clock.advance(5 * 1000);
      expect((await refresh(t, second.refreshToken)).status).toBe(200);
      t.clock.advance(5 * 1000);
      expect(await errorOf(await refresh(t, first.refreshToken))).toEqual({ status: 401, code: "unauthorized" });
      expect(openSessions(t)).toBe(0);
      expect((await refresh(t, otherDevice.refreshToken)).status).toBe(401);
    });
  });

  test("an unknown, expired or malformed refresh token is 401 or 400", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: "A".repeat(43) } })).status).toBe(401);
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: "short" } })).status).toBe(400);
    t.clock.advance(31 * 24 * 60 * 60 * 1000);
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } })).status).toBe(401);
  });

  test("sign-out ends the session at once, even with a good access token", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    expect((await t.call("POST", "/auth/sign-out", { token: tokens.accessToken })).status).toBe(204);
    expect((await t.call("GET", "/me", { token: tokens.accessToken })).status).toBe(401);
    expect((await t.call("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } })).status).toBe(401);
  });

  test("requireMember checks the member every request: suspended 403, banned 401, stopped fine", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    t.db.query("UPDATE member SET status = 'suspended'").run();
    expect(await errorOf(await t.call("GET", "/me", { token: tokens.accessToken }))).toEqual({ status: 403, code: "account_suspended" });
    t.db.query("UPDATE member SET status = 'banned'").run();
    expect((await t.call("GET", "/me", { token: tokens.accessToken })).status).toBe(401);
    t.db.query("UPDATE member SET status = 'stopped'").run();
    expect((await t.call("GET", "/me", { token: tokens.accessToken })).status).toBe(200);
  });

  test("a token signed with another key, or none, is 401", async () => {
    const t = await testApp();
    const other = await testApp();
    const foreign = await other.signIn(PHONES[0] as string);
    await t.signIn(PHONES[0] as string);
    expect((await t.call("GET", "/me", { token: foreign.accessToken })).status).toBe(401);
    expect((await t.call("GET", "/me")).status).toBe(401);
    expect((await t.call("GET", "/me", { headers: { authorization: "Basic abc" } })).status).toBe(401);
  });

  test("a token with the right key but the wrong issuer, audience or algorithm is 401", async () => {
    const t = await testApp();
    await t.signIn(PHONES[0] as string);
    const member = t.db.query("SELECT id FROM member").get() as { id: string };
    const session = t.db.query("SELECT id FROM auth_session").get() as { id: string };
    const nowSeconds = Math.floor(t.clock().getTime() / 1000);
    const mint = (alg: string, issuer: string, audience: string, key: Parameters<SignJWT["sign"]>[0]) =>
      new SignJWT({ sid: session.id })
        .setProtectedHeader({ alg, kid: t.app.config.jwt.kid })
        .setSubject(member.id)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt(nowSeconds)
        .setExpirationTime(nowSeconds + 600)
        .sign(key);
    const key = t.app.config.jwt.privateKey;
    // The control: the same claims, signed the same way, are accepted.
    expect((await t.call("GET", "/me", { token: await mint("ES256", "turnout", "turnout-app", key) })).status).toBe(200);
    expect((await t.call("GET", "/me", { token: await mint("ES256", "someone-else", "turnout-app", key) })).status).toBe(401);
    expect((await t.call("GET", "/me", { token: await mint("ES256", "turnout", "another-app", key) })).status).toBe(401);
    // A token with a different algorithm is refused, even with the right claims.
    const secret = createSecretKey(Buffer.from("not-the-signing-key-but-long-enough-0123"));
    expect((await t.call("GET", "/me", { token: await mint("HS256", "turnout", "turnout-app", secret) })).status).toBe(401);
  });

  test("the previous public key still verifies tokens until it is removed", async () => {
    const { generateKeyPair, exportPKCS8, exportSPKI } = await import("jose");
    const oldPair = await generateKeyPair("ES256", { extractable: true });
    const newPair = await generateKeyPair("ES256", { extractable: true });
    const oldEnv = {
      AUTH_JWT_PRIVATE_KEY: await exportPKCS8(oldPair.privateKey),
      AUTH_JWT_PUBLIC_KEY: await exportSPKI(oldPair.publicKey),
    };
    const a = await testApp({ env: oldEnv });
    const tokens = await a.signIn(PHONES[0] as string);
    // Same database, new signing key, old public key kept as previous.
    const b = await testApp({
      env: {
        AUTH_JWT_PRIVATE_KEY: await exportPKCS8(newPair.privateKey),
        AUTH_JWT_PUBLIC_KEY: await exportSPKI(newPair.publicKey),
        AUTH_JWT_PREVIOUS_PUBLIC_KEY: await exportSPKI(oldPair.publicKey),
      },
    });
    const rows = a.db.serialize();
    void rows;
    for (const table of ["member", "profile", "auth_session"]) {
      for (const row of a.db.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) {
        const columns = Object.keys(row);
        b.db
          .query(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
          .run(...(Object.values(row) as never[]));
      }
    }
    expect((await b.call("GET", "/me", { token: tokens.accessToken })).status).toBe(200);
    const c = await testApp({
      env: { AUTH_JWT_PRIVATE_KEY: await exportPKCS8(newPair.privateKey), AUTH_JWT_PUBLIC_KEY: await exportSPKI(newPair.publicKey) },
    });
    for (const table of ["member", "profile", "auth_session"]) {
      for (const row of a.db.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) {
        const columns = Object.keys(row);
        c.db
          .query(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
          .run(...(Object.values(row) as never[]));
      }
    }
    expect((await c.call("GET", "/me", { token: tokens.accessToken })).status).toBe(401);
  });
});

describe("secrets stay out of logs", () => {
  test("no log line, alert or error body holds a code, token, phone or secret", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    t.sender.failWith = "131042";
    const failed = await t.call("POST", "/auth/otp", { body: { phone: PHONES[1], purpose: "sign_in" } });
    const bodies = JSON.stringify(await failed.json());
    await t.call("GET", "/me", { token: tokens.accessToken });
    await t.call("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } });
    const everything = JSON.stringify([t.logs, t.alerts.sent, bodies]);
    for (const secret of [
      tokens.accessToken,
      tokens.refreshToken,
      PHONES[0],
      PHONES[1],
      String(PHONES[0]).slice(1),
      t.app.config.otpPepper,
      t.app.config.fileLinkSecret,
      "test-app-secret",
      "test-access-token",
    ]) {
      expect(everything).not.toContain(secret as string);
    }
    const sentCode = t.sender.sent[0]?.code as string;
    expect(everything).not.toContain(sentCode);
    for (const entry of t.logs)
      expect(Object.keys(entry).sort()).toEqual(
        Object.keys(entry)
          .filter((k) => ["at", "method", "route", "status", "ms", "member", "error"].includes(k))
          .sort(),
      );
  });
});

describe("spend alerts", () => {
  test("500, 1000 and 1500 INR each alert once a month", async () => {
    const t = await testApp();
    const { start } = windowFor("ist_day", t.clock());
    const set = (count: number) =>
      t.db
        .query(
          "INSERT INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, 86400, ?) ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = ?",
        )
        .run(OTP_SENDS_KEY, start, count, count);
    set(3000);
    expect(await checkOtpSpend(t.db, t.clock(), t.alerts, t.app.config.tunables)).toEqual([]);
    set(3677);
    expect(await checkOtpSpend(t.db, t.clock(), t.alerts, t.app.config.tunables)).toEqual([500]);
    expect(await checkOtpSpend(t.db, t.clock(), t.alerts, t.app.config.tunables)).toEqual([]);
    set(7353);
    expect(await checkOtpSpend(t.db, t.clock(), t.alerts, t.app.config.tunables)).toEqual([1000]);
    set(11030);
    expect(await checkOtpSpend(t.db, t.clock(), t.alerts, t.app.config.tunables)).toEqual([1500]);
    expect(t.alerts.sent.map((a) => a.kind)).toEqual(["otp_spend_500", "otp_spend_1000", "otp_spend_1500"]);
    // A new month starts again.
    t.clock.set("2026-11-02T06:00:00Z");
    const { start: nextStart } = windowFor("ist_day", t.clock());
    t.db
      .query("INSERT INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, 86400, 3677)")
      .run(OTP_SENDS_KEY, nextStart);
    expect(await checkOtpSpend(t.db, t.clock(), t.alerts, t.app.config.tunables)).toEqual([500]);
  });
});

describe("clientIp", () => {
  const request = (value?: string): Request =>
    new Request("http://x.test/", value === undefined ? {} : { headers: { "x-forwarded-for": value } });

  test("with no proxy header configured, the header is ignored and the socket address is used", () => {
    expect(clientIp(request("203.0.113.9"), null, "198.51.100.1")).toBe("198.51.100.1");
    expect(clientIp(request(), null, null)).toBe("unknown");
  });

  test("behind a proxy the last entry counts, so a client cannot choose its own address", () => {
    expect(clientIp(request("203.0.113.9"), "x-forwarded-for", "198.51.100.1")).toBe("203.0.113.9");
    expect(clientIp(request("6.6.6.6, 203.0.113.9"), "x-forwarded-for", "198.51.100.1")).toBe("203.0.113.9");
    expect(clientIp(request("6.6.6.6,203.0.113.9 "), "x-forwarded-for", null)).toBe("203.0.113.9");
  });

  test("a missing or empty header falls back to the socket address", () => {
    expect(clientIp(request(), "x-forwarded-for", "198.51.100.1")).toBe("198.51.100.1");
    expect(clientIp(request(""), "x-forwarded-for", "198.51.100.1")).toBe("198.51.100.1");
    expect(clientIp(request(" , "), "x-forwarded-for", null)).toBe("unknown");
  });
});
