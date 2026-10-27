import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { DID_NOT_REQUEST_PAYLOAD } from "../src/app-api/routes/whatsappWebhook.js";
import { PHONES, type TestApp, testApp } from "./appHelpers.js";

const SECRET = "test-app-secret";

const sign = (body: string, secret = SECRET): string => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const post = (t: TestApp, payload: unknown, signature?: string | null) => {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-hub-signature-256"] = signature ?? sign(body);
  return t.call("POST", "/webhooks/whatsapp", { rawBody: body, headers });
};

const statusPayload = (wamid: string, status: string, code?: number) => ({
  entry: [{ changes: [{ value: { statuses: [{ id: wamid, status, ...(code === undefined ? {} : { errors: [{ code }] }) }] } }] }],
});

async function challengeStatus(t: TestApp, phone: string): Promise<{ id: string; wamid: string; status: string; error: string | null }> {
  await t.call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" } });
  const row = t.db
    .query("SELECT id, wamid, delivery_status, delivery_error_code FROM otp_challenge ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get() as Record<string, string | null>;
  return {
    id: row.id as string,
    wamid: row.wamid as string,
    status: row.delivery_status as string,
    error: (row.delivery_error_code ?? null) as string | null,
  };
}

const statusOf = (t: TestApp, wamid: string) =>
  t.db.query("SELECT delivery_status, delivery_error_code FROM otp_challenge WHERE wamid = ?").get(wamid) as {
    delivery_status: string;
    delivery_error_code: string | null;
  };

describe("webhook verification", () => {
  test("GET echoes the challenge only for the right token", async () => {
    const t = await testApp();
    const good = await t.call("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345");
    expect(good.status).toBe(200);
    expect(await good.text()).toBe("12345");
    const bad = await t.call("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345");
    expect(bad.status).toBe(403);
    expect((await t.call("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=1")).status).toBe(403);
  });

  test("without WhatsApp configured the routes are 404", async () => {
    const t = await testApp({
      env: {
        WHATSAPP_APP_SECRET: "",
        WHATSAPP_VERIFY_TOKEN: "",
        WHATSAPP_ACCESS_TOKEN: "",
        WHATSAPP_PHONE_NUMBER_ID: "",
        WHATSAPP_TEMPLATE_NAME: "",
      },
    });
    expect((await t.call("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1")).status).toBe(404);
    expect((await post(t, {})).status).toBe(404);
  });
});

describe("webhook signature", () => {
  test("a missing, wrong or malformed signature is 401 and changes nothing", async () => {
    const t = await testApp();
    const { wamid } = await challengeStatus(t, PHONES[0] as string);
    const payload = statusPayload(wamid, "delivered");
    const body = JSON.stringify(payload);
    expect((await post(t, body, null)).status).toBe(401);
    expect((await post(t, body, sign(body, "another-secret"))).status).toBe(401);
    expect((await post(t, body, "sha256=zz")).status).toBe(401);
    expect((await post(t, body, createHmac("sha256", SECRET).update(body).digest("hex"))).status).toBe(401);
    // A signature over a different body does not carry over.
    expect((await post(t, body, sign(`${body} `))).status).toBe(401);
    expect(statusOf(t, wamid).delivery_status).toBe("sent");
  });

  test("a good signature is always 200, even for junk", async () => {
    const t = await testApp();
    expect((await post(t, "not json")).status).toBe(200);
    expect((await post(t, {})).status).toBe(200);
    expect((await post(t, { entry: [{ changes: [{ value: { statuses: [{ id: 5 }, null] } }] }] })).status).toBe(200);
    expect((await post(t, statusPayload("wamid.unknown", "delivered"))).status).toBe(200);
  });
});

describe("delivery status", () => {
  test("sent, delivered and read move forward and never back", async () => {
    const t = await testApp();
    const { wamid } = await challengeStatus(t, PHONES[0] as string);
    await post(t, statusPayload(wamid, "delivered"));
    expect(statusOf(t, wamid).delivery_status).toBe("delivered");
    await post(t, statusPayload(wamid, "sent"));
    expect(statusOf(t, wamid).delivery_status).toBe("delivered");
    await post(t, statusPayload(wamid, "read"));
    expect(statusOf(t, wamid).delivery_status).toBe("read");
  });

  test("a failure records its error code", async () => {
    const t = await testApp();
    const { wamid } = await challengeStatus(t, PHONES[0] as string);
    await post(t, statusPayload(wamid, "failed", 131000));
    expect(statusOf(t, wamid)).toEqual({ delivery_status: "failed", delivery_error_code: "131000" });
  });

  test("131026 becomes undeliverable, which the status route reports", async () => {
    const t = await testApp();
    const { id, wamid } = await challengeStatus(t, PHONES[0] as string);
    await post(t, statusPayload(wamid, "failed", 131026));
    expect(statusOf(t, wamid)).toEqual({ delivery_status: "undeliverable", delivery_error_code: "131026" });
    const response = await t.call("GET", `/auth/otp/${id}`);
    expect(((await response.json()) as { deliveryStatus: string }).deliveryStatus).toBe("undeliverable");
    expect(t.alerts.sent).toHaveLength(0);
  });

  test("the fake sender can report an undeliverable number at send time", async () => {
    const t = await testApp();
    t.sender.undeliverablePhones.add(PHONES[1] as string);
    const { status, error } = await challengeStatus(t, PHONES[1] as string);
    expect(status).toBe("undeliverable");
    expect(error).toBe("131026");
  });

  test("131042 in a webhook alerts the operator", async () => {
    const t = await testApp();
    const { wamid } = await challengeStatus(t, PHONES[0] as string);
    await post(t, statusPayload(wamid, "failed", 131042));
    expect(t.alerts.sent.map((a) => a.kind)).toContain("whatsapp_131042");
  });
});

describe("didn't request this code", () => {
  const buttonPayload = (digits: string, payload = DID_NOT_REQUEST_PAYLOAD) => ({
    entry: [
      { changes: [{ value: { messages: [{ from: digits, type: "button", button: { payload, text: "I did not request this" } }] } }] },
    ],
  });

  test("the button voids the open code and blocks the number for 24 hours", async () => {
    const t = await testApp();
    const phone = PHONES[0] as string;
    const { id } = await challengeStatus(t, phone);
    const code = t.sender.lastCode(phone) as string;
    expect((await post(t, buttonPayload(phone.slice(1)))).status).toBe(200);
    const voided = t.db.query("SELECT voided_at FROM otp_challenge WHERE id = ?").get(id) as { voided_at: string | null };
    expect(voided.voided_at).not.toBeNull();
    const verify = await t.call("POST", "/auth/otp/verify", { body: { challengeId: id, phone, code, noticeVersion: "2026-10-26" } });
    expect(verify.status).toBe(400);
    const sent = t.sender.sent.length;
    const refused = await t.call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" } });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("sign_in_unavailable");
    expect(t.sender.sent).toHaveLength(sent);
    // Other numbers are fine, and the block ends after 24 hours.
    expect((await t.call("POST", "/auth/otp", { body: { phone: PHONES[1], purpose: "sign_in" } })).status).toBe(200);
    t.clock.advance(24 * 60 * 60 * 1000 + 1000);
    expect((await t.call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" } })).status).toBe(200);
  });

  test("other buttons and odd senders are ignored", async () => {
    const t = await testApp();
    const phone = PHONES[0] as string;
    await post(t, buttonPayload(phone.slice(1), "SOMETHING_ELSE"));
    await post(t, buttonPayload("abc"));
    expect((await t.call("POST", "/auth/otp", { body: { phone, purpose: "sign_in" } })).status).toBe(200);
  });
});
