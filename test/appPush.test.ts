import { describe, expect, test } from "bun:test";
import { PUSH_PLATFORM_NAMES } from "@turnout/contract/app/devices";
import { NOTICE_PUSH_TEXT, noticeKindSchema } from "@turnout/contract/app/notices";
import { loadAppConfig } from "../src/app-api/env.js";
import { ConfigError, createAppContext } from "../src/app-api/index.js";
import { receiptResult, ticketResult } from "../src/app-api/vendors/expoPush.js";
import { fakePushSender } from "../src/app-api/vendors/push.js";
import { memoryStore } from "../src/utils/objectStore.js";
import { memoryDb } from "./helpers.js";

describe("Expo ticket and receipt mappers", () => {
  test("an ok ticket carries its id", () => {
    expect(ticketResult({ status: "ok", id: "abc" })).toEqual({ ok: true, ticketId: "abc" });
  });

  test("an error ticket carries Expo's error name, and only DeviceNotRegistered means the device is gone", () => {
    expect(
      ticketResult({ status: "error", message: "text with a token ExponentPushToken[x]", details: { error: "DeviceNotRegistered" } }),
    ).toEqual({
      ok: false,
      errorCode: "DeviceNotRegistered",
      gone: true,
    });
    expect(ticketResult({ status: "error", message: "slow down", details: { error: "MessageRateExceeded" } })).toEqual({
      ok: false,
      errorCode: "MessageRateExceeded",
      gone: false,
    });
  });

  test("an error ticket without details is a generic error, and a missing ticket is no_ticket; neither keeps Expo's message", () => {
    const generic = ticketResult({ status: "error", message: "ExponentPushToken[secret-token-value]" });
    expect(generic).toEqual({ ok: false, errorCode: "ExpoError", gone: false });
    expect(JSON.stringify(generic)).not.toContain("secret-token-value");
    expect(ticketResult(undefined)).toEqual({ ok: false, errorCode: "no_ticket", gone: false });
  });

  test("receipts map the same way", () => {
    expect(receiptResult({ status: "ok" })).toEqual({ ok: true });
    expect(receiptResult({ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } })).toEqual({
      ok: false,
      errorCode: "DeviceNotRegistered",
      gone: true,
    });
    expect(receiptResult({ status: "error", message: "m" })).toEqual({ ok: false, errorCode: "ExpoError", gone: false });
  });
});

describe("the fake sender", () => {
  test("keeps what it was asked to send and answers one result per message in order", async () => {
    const sender = fakePushSender();
    sender.failTokens.set("ExponentPushToken[bad-token-1]", "DeviceNotRegistered");
    const base = { title: "t", body: "b", data: { kind: "head_over" as const, noticeId: "n", planId: null }, ttlSeconds: 60 };
    const results = await sender.send([
      { ...base, token: "ExponentPushToken[good-token-1]" },
      { ...base, token: "ExponentPushToken[bad-token-1]" },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(results[1]).toMatchObject({ errorCode: "DeviceNotRegistered", gone: true });
    expect(sender.sent).toHaveLength(1);
  });
});

describe("push settings", () => {
  const GRIEVANCE = {
    GRIEVANCE_NAME: "A. Officer",
    GRIEVANCE_ADDRESS: "1 Example Road, Bengaluru",
    GRIEVANCE_EMAIL: "grievance@example.com",
    GRIEVANCE_PHONE: "+1 202 555 0100",
  };

  test("outside production the sender is the fake one unless PUSH_SENDER=expo, and platforms default to android", async () => {
    const dev = await loadAppConfig({ TURNOUT_ENV: "development" });
    expect(dev.pushSender).toBe("fake");
    expect(dev.push).toEqual({ android: true, ios: false });
    expect((await loadAppConfig({ TURNOUT_ENV: "staging", PUSH_SENDER: "expo", PUSH_PLATFORMS: "android,ios" })).pushSender).toBe("expo");
    expect((await loadAppConfig({ TURNOUT_ENV: "staging", PUSH_PLATFORMS: "android, ios" })).push).toEqual({ android: true, ios: true });
  });

  test("production refuses PUSH_SENDER=fake and otherwise uses Expo", async () => {
    const error = (await loadAppConfig({ TURNOUT_ENV: "production", ...GRIEVANCE, PUSH_SENDER: "fake" }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("PUSH_SENDER=fake is not allowed in production");
    const noChoice = (await loadAppConfig({ TURNOUT_ENV: "production", ...GRIEVANCE }).catch((e: unknown) => e)) as Error;
    expect(noChoice.message).not.toContain("PUSH_SENDER");
  });

  test("an unknown PUSH_SENDER or platform is refused by name", async () => {
    const sender = (await loadAppConfig({ TURNOUT_ENV: "staging", PUSH_SENDER: "apns" }).catch((e: unknown) => e)) as Error;
    expect(sender.message).toContain("PUSH_SENDER must be expo or fake");
    const platform = (await loadAppConfig({ TURNOUT_ENV: "staging", PUSH_PLATFORMS: "web" }).catch((e: unknown) => e)) as Error;
    expect(platform.message).toContain("PUSH_PLATFORMS holds android, ios or both");
  });

  test("the Expo access token is optional and never appears in the config errors", async () => {
    expect((await loadAppConfig({ TURNOUT_ENV: "staging" })).expoAccessToken).toBeNull();
    expect((await loadAppConfig({ TURNOUT_ENV: "staging", EXPO_ACCESS_TOKEN: "expo-secret-value" })).expoAccessToken).toBe(
      "expo-secret-value",
    );
  });

  test("createAppContext builds the Expo sender when asked, and takes a sender passed in code", async () => {
    const store = memoryStore({ now: () => new Date(), link: (key) => key });
    const expo = await createAppContext({ db: memoryDb(), env: { TURNOUT_ENV: "staging", PUSH_SENDER: "expo" }, store });
    expect((expo.push as { fake?: boolean }).fake).toBeUndefined();
    const given = fakePushSender();
    const app = await createAppContext({ db: memoryDb(), env: { TURNOUT_ENV: "staging" }, store, push: given });
    expect(app.push).toBe(given);
  });
});

describe("the push text", () => {
  test("every kind has fixed text that names no person, show, cafe or reason", () => {
    for (const kind of noticeKindSchema.options) {
      const text = NOTICE_PUSH_TEXT[kind];
      expect(text.title).toBe("Turnout");
      expect(text.body.length).toBeGreaterThan(5);
      expect(text.body).not.toMatch(/ticket (number|id)|cafe|rejected because|\d/i);
    }
    expect(PUSH_PLATFORM_NAMES).toEqual(["android", "ios"]);
  });
});
