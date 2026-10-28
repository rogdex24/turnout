import { describe, expect, test } from "bun:test";
import { configResponseSchema } from "@turnout/contract/app/config";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { consentResponseSchema, meResponseSchema } from "@turnout/contract/app/me";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import type { z } from "zod";
import type { Route } from "../src/app-api/context.js";
import { loadAppConfig, STAGING_TEST_TOKEN_MIN_LENGTH } from "../src/app-api/env.js";
import { ok } from "../src/app-api/http.js";
import { appResponse, ConfigError, createAppContext } from "../src/app-api/index.js";
import { enforce } from "../src/app-api/rateLimit.js";
import { appRoutes } from "../src/app-api/routes/index.js";
import { fakeOtpSender } from "../src/app-api/vendors/otpSender.js";
import { memoryStore } from "../src/utils/objectStore.js";
import { BASE, PHONES, REVIEWER_CODE, REVIEWER_PHONE, TEST_TOKEN, testApp } from "./appHelpers.js";
import { memoryDb } from "./helpers.js";

const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;

const GRIEVANCE = {
  GRIEVANCE_NAME: "A. Officer",
  GRIEVANCE_ADDRESS: "1 Example Road, Bengaluru",
  GRIEVANCE_EMAIL: "grievance@example.com",
  GRIEVANCE_PHONE: "+1 202 555 0100",
};

describe("routing and errors", () => {
  test("no token is 401 on every member route, in the standard error shape", async () => {
    const t = await testApp();
    for (const [method, path] of [
      ["GET", "/me"],
      ["PATCH", "/me/profile"],
      ["PUT", "/me/handle"],
      ["PUT", "/me/photo"],
      ["GET", "/me/photo"],
      ["POST", "/me/consent"],
      ["POST", "/auth/sign-out"],
    ] as const) {
      const response = await t.call(method, path, { body: {} });
      expect(response.status).toBe(401);
      expect((await errorOf(response)).code).toBe("unauthorized");
    }
  });

  test("an unknown path is 404 and a wrong method is 405 with Allow, both in the error shape", async () => {
    const t = await testApp();
    const missing = await t.call("GET", "/nothing-here");
    expect(missing.status).toBe(404);
    expect((await errorOf(missing)).code).toBe("not_found");
    const wrong = await t.call("DELETE", "/config");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET");
    expect((await errorOf(wrong)).code).toBe("method_not_allowed");
  });

  test("a bad body is 400 with a message that names the field and never repeats the value", async () => {
    const t = await testApp();
    const { accessToken } = await t.signIn(PHONES[0] as string);
    const response = await t.call("PATCH", "/me/profile", {
      token: accessToken,
      body: { firstName: "", gender: "woman", groupPref: "open" },
    });
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("invalid_request");
    expect(error.message).toContain("firstName");
    const notJson = await t.call("PATCH", "/me/profile", { token: accessToken, rawBody: "{nope" });
    expect(notJson.status).toBe(400);
    const wrongShape = await t.call("POST", "/me/consent", { token: accessToken, body: { noticeVersion: 5 } });
    expect((await errorOf(wrongShape)).message).toContain("noticeVersion");
    const secretValue = "super-secret-value-123";
    const echoed = await t.call("POST", "/me/consent", { token: accessToken, body: { noticeVersion: NOTICE_VERSION, extra: secretValue } });
    expect(echoed.status).toBe(400);
    expect(JSON.stringify(await echoed.json())).not.toContain(secretValue);
  });

  test("a JSON body over 16 KB is 413 payload_too_large", async () => {
    const t = await testApp();
    const { accessToken } = await t.signIn(PHONES[0] as string);
    const big = JSON.stringify({ noticeVersion: "x".repeat(20_000) });
    const response = await t.call("POST", "/me/consent", { token: accessToken, rawBody: big });
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("payload_too_large");
  });

  test("an unexpected failure is a 500 server_error with no detail, and the log keeps the error name only", async () => {
    const boom: Route = {
      method: "GET",
      pattern: "/boom",
      auth: "none",
      handler: () => {
        throw new Error("secret detail 4242");
      },
    };
    const t = await testApp({ extraRoutes: [boom] });
    const response = await t.call("GET", "/boom");
    expect(response.status).toBe(500);
    const error = await errorOf(response);
    expect(error.code).toBe("server_error");
    expect(JSON.stringify(error)).not.toContain("4242");
    expect(JSON.stringify(t.logs)).not.toContain("4242");
  });

  test("the log line has the route pattern, status, duration and a member hash, and no ids or tokens", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    t.logs.length = 0;
    await t.call("GET", "/me", { token: tokens.accessToken });
    await t.call("GET", "/auth/otp/some-challenge-id");
    const [me, challenge] = t.logs;
    expect(me).toMatchObject({ method: "GET", route: "/me", status: 200 });
    expect(me?.member).toMatch(/^[0-9a-f]{12}$/);
    expect(typeof me?.ms).toBe("number");
    expect(challenge?.route).toBe("/auth/otp/:challengeId");
    expect(JSON.stringify(t.logs)).not.toContain("some-challenge-id");
    const memberId = (t.db.query("SELECT id FROM member").get() as { id: string }).id;
    expect(JSON.stringify(t.logs)).not.toContain(memberId);
  });
});

describe("GET /config", () => {
  test("answers without a token and parses with its contract schema", async () => {
    const t = await testApp({
      env: { ...GRIEVANCE, MIN_APP_VERSION: "1.2.0", PUSH_PLATFORMS: "android,ios", SUPPORT_EMAIL: "help@example.com" },
    });
    const response = await t.call("GET", "/config");
    expect(response.status).toBe(200);
    const config = configResponseSchema.parse(await response.json());
    expect(config.notice.version).toBe(NOTICE_VERSION);
    expect(config.notice.text.length).toBeGreaterThan(200);
    expect(config.push).toEqual({ android: true, ios: true });
    expect(config.support.email).toBe("help@example.com");
    expect(config.minAppVersion).toBe("1.2.0");
    expect(config.grievance).toEqual({
      name: "A. Officer",
      address: "1 Example Road, Bengaluru",
      email: "grievance@example.com",
      phone: "+1 202 555 0100",
    });
  });
});

describe("production settings", () => {
  const production = async (env: Record<string, string>) => loadAppConfig({ TURNOUT_ENV: "production", ...env });

  /** Every setting a production start needs. */
  async function fullProductionEnv(): Promise<Record<string, string>> {
    const { generateKeyPair, exportPKCS8, exportSPKI } = await import("jose");
    const pair = await generateKeyPair("ES256", { extractable: true });
    return {
      TURNOUT_ENV: "production",
      ...GRIEVANCE,
      OTP_PEPPER: "pepper-for-tests",
      BAN_PEPPER: "ban-pepper-for-tests",
      FILE_LINK_SECRET: "link-secret-for-tests",
      AUTH_JWT_PRIVATE_KEY: (await exportPKCS8(pair.privateKey)).replaceAll("\n", "\\n"),
      AUTH_JWT_PUBLIC_KEY: await exportSPKI(pair.publicKey),
      WHATSAPP_ACCESS_TOKEN: "a",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_TEMPLATE_NAME: "t",
      WHATSAPP_APP_SECRET: "s",
      WHATSAPP_VERIFY_TOKEN: "v",
    };
  }

  test("production refuses to start without the grievance block, and says which part", async () => {
    const error = await production({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    for (const name of [
      "GRIEVANCE_NAME",
      "GRIEVANCE_ADDRESS",
      "GRIEVANCE_EMAIL",
      "GRIEVANCE_PHONE",
      "OTP_PEPPER",
      "FILE_LINK_SECRET",
      "AUTH_JWT_PRIVATE_KEY",
    ])
      expect(message).toContain(name);
  });

  test("production refuses the fake sender and the memory store", async () => {
    const error = (await production({ ...GRIEVANCE, OTP_SENDER: "fake", OBJECT_STORE: "memory" }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("OTP_SENDER=fake is not allowed in production");
    expect(error.message).toContain("OBJECT_STORE=memory is not allowed in production");
  });

  test("createAppContext refuses a production start when the settings ask for the fake sender", async () => {
    await expect(
      createAppContext({ db: memoryDb(), env: { TURNOUT_ENV: "production", OTP_SENDER: "fake", ...GRIEVANCE } }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  test("createAppContext refuses a fake sender passed in code with a production config, and takes a real one", async () => {
    const env = await fullProductionEnv();
    const store = memoryStore({ now: () => new Date(), link: (key) => key });
    const error = (await createAppContext({ db: memoryDb(), env, sender: fakeOtpSender(), store }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("not allowed in production");
    // The same settings start with a sender that is not the fake one.
    const real = { send: async () => ({ ok: true as const, wamid: "wamid.example" }) };
    const app = await createAppContext({ db: memoryDb(), env, sender: real, store });
    expect(app.config.env).toBe("production");
    // And the fake is still fine outside production.
    const staging = await createAppContext({ db: memoryDb(), env: { TURNOUT_ENV: "staging" }, sender: fakeOtpSender(), store });
    expect(staging.config.env).toBe("staging");
  });

  test("serve needs TURNOUT_ENV: without it the settings are refused, not read as development", async () => {
    const error = (await loadAppConfig({}, { requireEnv: true }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("TURNOUT_ENV is required");
    expect((await loadAppConfig({ TURNOUT_ENV: "  " }, { requireEnv: true }).catch((e: unknown) => e)) as Error).toBeInstanceOf(
      ConfigError,
    );
    expect((await loadAppConfig({ TURNOUT_ENV: "development" }, { requireEnv: true })).env).toBe("development");
    // Tests and tools that load the settings without the option still default to development.
    expect((await loadAppConfig({})).env).toBe("development");
    await expect(createAppContext({ db: memoryDb(), env: {}, requireEnv: true })).rejects.toBeInstanceOf(ConfigError);
  });

  test("a STAGING_TEST_TOKEN shorter than 32 characters is refused, and 32 is fine", async () => {
    expect(STAGING_TEST_TOKEN_MIN_LENGTH).toBe(32);
    const short = (await loadAppConfig({ TURNOUT_ENV: "staging", STAGING_TEST_TOKEN: "a".repeat(31) }).catch((e: unknown) => e)) as Error;
    expect(short).toBeInstanceOf(ConfigError);
    expect(short.message).toContain("STAGING_TEST_TOKEN must be at least 32 characters");
    expect(short.message).not.toContain("a".repeat(31));
    expect((await loadAppConfig({ TURNOUT_ENV: "staging", STAGING_TEST_TOKEN: "a".repeat(32) })).stagingTestToken).toBe("a".repeat(32));
    expect((await loadAppConfig({ TURNOUT_ENV: "staging" })).stagingTestToken).toBeNull();
  });

  test("a full production setup loads, with no ephemeral secrets and no staging token", async () => {
    const config = await loadAppConfig({ ...(await fullProductionEnv()), STAGING_TEST_TOKEN: "should-be-ignored" });
    expect(config.otpSender).toBe("whatsapp");
    expect(config.ephemeral).toEqual([]);
    expect(config.stagingTestToken).toBeNull();
    expect(config.objectStore).toBe("disk");
  });

  test("outside production a missing secret is filled for the run and listed by name only", async () => {
    const config = await loadAppConfig({ TURNOUT_ENV: "development" });
    expect(config.ephemeral).toEqual(expect.arrayContaining(["OTP_PEPPER", "FILE_LINK_SECRET", "AUTH_JWT_PRIVATE_KEY"]));
    expect(config.otpSender).toBe("fake");
  });

  test("production leaves the staging test routes out of the route table, even with a token set", async () => {
    const t = await testApp();
    const patterns = (app: typeof t.app) => appRoutes(app).map((route) => route.pattern);
    expect(patterns(t.app)).toContain("/__test/otp");
    const asProduction = { ...t.app, config: { ...t.app.config, env: "production" as const } };
    expect(patterns(asProduction)).not.toContain("/__test/otp");
    expect(patterns(asProduction)).not.toContain("/__test/clock");
    const config = await loadAppConfig({ TURNOUT_ENV: "production", STAGING_TEST_TOKEN: "x" }).catch(() => null);
    expect(config).toBeNull();
  });
});

describe("staging test routes", () => {
  const header = { "x-staging-test-token": TEST_TOKEN };

  test("without the right token they are 404", async () => {
    const t = await testApp();
    const body = { phone: PHONES[0] };
    expect((await t.call("POST", "/__test/otp", { body })).status).toBe(404);
    expect((await t.call("POST", "/__test/otp", { body, headers: { "x-staging-test-token": "wrong" } })).status).toBe(404);
    const none = await testApp({ env: { STAGING_TEST_TOKEN: "" } });
    expect((await none.call("POST", "/__test/otp", { body, headers: header })).status).toBe(404);
  });

  test("/__test/otp returns the last code for a number and the reviewer's fixed code", async () => {
    const t = await testApp();
    await t.call("POST", "/auth/otp", { body: { phone: PHONES[0], purpose: "sign_in" } });
    const response = await t.call("POST", "/__test/otp", { body: { phone: PHONES[0] }, headers: header });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { code: string }).code).toBe(t.sender.lastCode(PHONES[0] as string) as string);
    const reviewer = await t.call("POST", "/__test/otp", { body: { phone: REVIEWER_PHONE }, headers: header });
    expect(((await reviewer.json()) as { code: string }).code).toBe(REVIEWER_CODE);
    expect((await t.call("POST", "/__test/otp", { body: { phone: PHONES[5] }, headers: header })).status).toBe(404);
  });

  test("/__test/clock moves a staging server's clock; a fixed test clock is left alone", async () => {
    const db = memoryDb();
    const staging = await createAppContext({ db, env: { TURNOUT_ENV: "staging", STAGING_TEST_TOKEN: TEST_TOKEN } });
    const call = (body: unknown) =>
      appResponse(
        staging,
        new Request(`http://localhost${BASE}/__test/clock`, {
          method: "POST",
          headers: { ...header, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const set = await call({ set: "2027-01-01T00:00:00Z" });
    expect(set.status).toBe(200);
    expect(staging.now().toISOString().slice(0, 10)).toBe("2027-01-01");
    await call({ advanceMs: 3 * 3600 * 1000 });
    expect(staging.now().toISOString().slice(0, 13)).toBe("2027-01-01T03");
    await call({ reset: true });
    expect(Math.abs(staging.now().getTime() - Date.now())).toBeLessThan(5000);
    expect(staging.config.otpSender).toBe("fake");
    const t = await testApp();
    expect((await t.call("POST", "/__test/clock", { body: { reset: true }, headers: header })).status).toBe(404);
  });
});

describe("GET /me and POST /me/consent", () => {
  test("a new member's /me parses and lists what is missing", async () => {
    const t = await testApp();
    const { accessToken } = await t.signIn(PHONES[0] as string);
    const response = await t.call("GET", "/me", { token: accessToken });
    expect(response.status).toBe(200);
    const me = meResponseSchema.parse(await response.json());
    expect(me.status).toBe("active");
    expect(me.phoneLast4).toBe(String(PHONES[0]).slice(-4));
    expect(me.matchable).toEqual({ ok: false, missing: ["name", "gender", "photo", "handle"] });
    expect(me.consent).toEqual({ noticeVersion: NOTICE_VERSION, current: true });
    expect(me.handle.state).toBe("missing");
    expect(me.profile.photo).toBeNull();
    expect(JSON.stringify(me)).not.toContain(String(PHONES[0]));
  });

  test("consent for the current version is kept once; an unknown version is 400", async () => {
    const t = await testApp();
    const { accessToken } = await t.signIn(PHONES[0] as string);
    const first = await t.call("POST", "/me/consent", { token: accessToken, body: { noticeVersion: NOTICE_VERSION } });
    expect(first.status).toBe(200);
    expect(consentResponseSchema.parse(await first.json()).noticeVersion).toBe(NOTICE_VERSION);
    await t.call("POST", "/me/consent", { token: accessToken, body: { noticeVersion: NOTICE_VERSION } });
    expect((t.db.query("SELECT COUNT(*) AS n FROM consent_record").get() as { n: number }).n).toBe(1);
    const unknown = await t.call("POST", "/me/consent", { token: accessToken, body: { noticeVersion: "1999-01-01" } });
    expect((await errorOf(unknown)).code).toBe("unknown_notice_version");
  });
});

describe("rate limits", () => {
  test("the 6th report in a day is 429 with Retry-After; the next IST day starts again", async () => {
    const probe: Route = {
      method: "POST",
      pattern: "/__probe/report",
      auth: "member",
      handler: ({ app, member, now }) => {
        enforce(app.db, app.config.otpPepper, "report", member?.member.id ?? "", app.config.tunables.rate.reportPerDay, now);
        return ok({ ok: true });
      },
    };
    const t = await testApp({ extraRoutes: [probe] });
    const { accessToken } = await t.signIn(PHONES[0] as string);
    for (let i = 0; i < 5; i++) expect((await t.call("POST", "/__probe/report", { token: accessToken })).status).toBe(200);
    const sixth = await t.call("POST", "/__probe/report", { token: accessToken });
    expect(sixth.status).toBe(429);
    expect((await errorOf(sixth.clone())).code).toBe("rate_limited");
    const wait = Number(sixth.headers.get("retry-after"));
    // 06:00 UTC is 11:30 IST: 12.5 hours to IST midnight.
    expect(wait).toBe(12.5 * 3600);
    t.clock.advance(12.5 * 3600 * 1000 + 1000);
    // The access token has expired by then, so sign in again.
    const again = await t.signIn(PHONES[0] as string);
    expect((await t.call("POST", "/__probe/report", { token: again.accessToken })).status).toBe(200);
  });
});

describe("every response parses with its contract schema", () => {
  test("a sweep over the M2 endpoints", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    const checks: [Response, z.ZodType][] = [
      [await t.call("GET", "/config"), configResponseSchema],
      [await t.call("GET", "/me", { token: tokens.accessToken }), meResponseSchema],
      [await t.call("GET", "/me/photo", { token: tokens.accessToken }), errorBodySchema],
      [await t.call("GET", "/nothing"), errorBodySchema],
    ];
    for (const [response, schema] of checks) expect(schema.safeParse(await response.json()).success).toBe(true);
    expect(BASE).toBe("/api/app/v1");
  });
});
