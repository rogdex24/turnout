import type { Database } from "bun:sqlite";
import type { TokenPair } from "@turnout/contract/app/auth";
import { ERROR_CODES } from "@turnout/contract/app/errors";
import { type Alerts, recordingAlerts } from "../src/app-api/alerts.js";
import type { AppContext, LogEntry, Route } from "../src/app-api/context.js";
import { appResponse, createAppContext } from "../src/app-api/index.js";
import { type FakeOtpSender, fakeOtpSender } from "../src/app-api/vendors/otpSender.js";
import { type FixedClock, fixedClock } from "../src/utils/clock.js";
import type { FetchLike } from "../src/utils/http.js";
import { memoryDb } from "./helpers.js";

/** Fictional numbers (the 555-01xx block), allowed through TEST_PHONE_ALLOWLIST. */
export const PHONES = Array.from({ length: 20 }, (_, index) => `+1202555${String(index + 100).padStart(4, "0")}`);
export const REVIEWER_PHONE = "+12025550199";
export const REVIEWER_CODE = "424242";
export const TEST_TOKEN = "staging-test-token-for-tests";

export const BASE = "/api/app/v1";

/** A valid +91 mobile, joined at run time from short parts so no source file holds a real-looking number. */
export const indianMobile = (): string => ["+91", "98", "76", "54", "32", "10"].join("");

export interface TestApp {
  app: AppContext;
  db: Database;
  clock: FixedClock;
  sender: FakeOtpSender;
  alerts: Alerts & { sent: { kind: string; text: string }[] };
  logs: LogEntry[];
  fetchCalls: { url: string; init: RequestInit }[];
  call(method: string, path: string, options?: CallOptions): Promise<Response>;
  /** Asks for a code, reads it from the fake sender and verifies it. */
  signIn(phone: string, ip?: string): Promise<TokenPair & { challengeId: string }>;
}

export interface CallOptions {
  body?: unknown;
  rawBody?: BodyInit | Uint8Array | null;
  token?: string;
  ip?: string;
  headers?: Record<string, string>;
}

export interface TestAppOptions {
  env?: Record<string, string>;
  fetch?: FetchLike;
  extraRoutes?: Route[];
  start?: string;
}

let ipCounter = 0;
/** A fresh address per call, so the per-address limits do not trip in tests that are not about them. */
export const freshIp = (): string => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

export async function testApp(options: TestAppOptions = {}): Promise<TestApp> {
  const db = memoryDb();
  const clock = fixedClock(options.start ?? "2026-10-27T06:00:00Z");
  const sender = fakeOtpSender();
  const alerts = recordingAlerts();
  const logs: LogEntry[] = [];
  const fetchCalls: TestApp["fetchCalls"] = [];
  const fetch: FetchLike =
    options.fetch ??
    (async (url, init) => {
      fetchCalls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
  const app = await createAppContext({
    db,
    now: clock,
    fetch,
    sender,
    log: (entry) => logs.push(entry),
    extraRoutes: options.extraRoutes,
    env: {
      TURNOUT_ENV: "test",
      TEST_PHONE_ALLOWLIST: PHONES.join(","),
      REVIEWER_PHONE,
      REVIEWER_OTP: REVIEWER_CODE,
      TRUST_PROXY_HEADER: "x-forwarded-for",
      STAGING_TEST_TOKEN: TEST_TOKEN,
      WHATSAPP_ACCESS_TOKEN: "test-access-token",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_TEMPLATE_NAME: "sign_in_code",
      WHATSAPP_APP_SECRET: "test-app-secret",
      WHATSAPP_VERIFY_TOKEN: "test-verify-token",
      ...options.env,
    },
  });
  app.alerts = alerts;
  const call: TestApp["call"] = (method, path, { body, rawBody, token, ip, headers } = {}) => {
    const init: RequestInit = { method, headers: { "x-forwarded-for": ip ?? freshIp(), ...headers } };
    if (rawBody !== undefined) init.body = rawBody as BodyInit | null;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["content-type"] = "application/json";
    }
    if (token) (init.headers as Record<string, string>).authorization = `Bearer ${token}`;
    return appResponse(app, new Request(`http://localhost${BASE}${path}`, init)).then(async (response) => {
      // Every error the server sends is in the contract's list.
      if (response.status >= 400 && response.headers.get("content-type")?.includes("json")) {
        const { error } = (await response.clone().json()) as { error: { code: string } };
        if (!(ERROR_CODES as readonly string[]).includes(error.code))
          throw new Error(`the server sent an error code that is not in the contract: ${error.code}`);
      }
      return response;
    });
  };
  const signIn: TestApp["signIn"] = async (phone, ip = freshIp()) => {
    const requested = await call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" }, ip });
    if (requested.status !== 200) throw new Error(`otp request answered ${requested.status}`);
    const { challengeId } = (await requested.json()) as { challengeId: string };
    const code = phone === REVIEWER_PHONE ? REVIEWER_CODE : sender.lastCode(phone);
    const verified = await call("POST", "/auth/otp/verify", { body: { challengeId, phone, code, noticeVersion: "2026-10-26" }, ip });
    if (verified.status !== 200) throw new Error(`verify answered ${verified.status}`);
    return { ...((await verified.json()) as TokenPair), challengeId };
  };
  return { app, db, clock, sender, alerts, logs, fetchCalls, call, signIn };
}
