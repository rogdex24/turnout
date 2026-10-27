import { createHmac, timingSafeEqual } from "node:crypto";
import { applyDeliveryStatus } from "../../social/otpChallenges.js";
import type { AppContext, Route } from "../context.js";
import { AppError, notFound } from "../errors.js";
import { readBytes } from "../http.js";
import { handleNotRequested } from "../otp.js";

/** What Meta posts is small; anything bigger is not from Meta. */
const MAX_WEBHOOK_BYTES = 1024 * 1024;

export const DID_NOT_REQUEST_PAYLOAD = "DID_NOT_REQUEST_CODE";

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** `X-Hub-Signature-256: sha256=<hex>` over the raw body, keyed with the app secret. */
export function validSignature(appSecret: string, body: Uint8Array, header: string | null): boolean {
  if (header === null || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest("hex");
  return sameText(header.slice("sha256=".length), expected);
}

interface WebhookValue {
  statuses?: { id?: unknown; status?: unknown; errors?: { code?: unknown }[] }[];
  messages?: { from?: unknown; type?: unknown; button?: { payload?: unknown } }[];
}

const STATUS_MAP = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" } as const;

async function applyValue(app: AppContext, value: WebhookValue, now: Date): Promise<void> {
  for (const update of value.statuses ?? []) {
    if (typeof update.id !== "string" || typeof update.status !== "string") continue;
    const errorCode = update.errors?.map((entry) => entry.code).find((code) => typeof code === "number" || typeof code === "string");
    const code = errorCode === undefined ? null : String(errorCode);
    const status = STATUS_MAP[update.status as keyof typeof STATUS_MAP];
    // 131026: the number cannot receive WhatsApp messages. It is not a send failure; the app shows its own message for it.
    const mapped = code === "131026" ? "undeliverable" : status;
    if (mapped === undefined) continue;
    applyDeliveryStatus(app.db, update.id, mapped, code);
    if (code === "131042") {
      await app.alerts.notify(
        "whatsapp_131042",
        "WhatsApp reported a billing problem (131042). Check the WhatsApp Business payment method.",
      );
    }
  }
  for (const message of value.messages ?? []) {
    if (message.button?.payload !== DID_NOT_REQUEST_PAYLOAD || typeof message.from !== "string" || !/^\d{6,15}$/.test(message.from))
      continue;
    handleNotRequested(app, `+${message.from}`, now);
  }
}

export const whatsappWebhookRoutes: Route[] = [
  {
    // Meta's one-time check when the webhook is set up.
    method: "GET",
    pattern: "/webhooks/whatsapp",
    auth: "none",
    handler: ({ app, url }) => {
      const whatsapp = app.config.whatsapp;
      if (whatsapp === null) throw notFound();
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (
        url.searchParams.get("hub.mode") !== "subscribe" ||
        token === null ||
        challenge === null ||
        !sameText(token, whatsapp.verifyToken)
      ) {
        throw new AppError(403, "unauthorized", "forbidden");
      }
      return new Response(challenge, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    },
  },
  {
    method: "POST",
    pattern: "/webhooks/whatsapp",
    auth: "none",
    handler: async ({ app, request, now }) => {
      const whatsapp = app.config.whatsapp;
      if (whatsapp === null) throw notFound();
      const body = await readBytes(request, MAX_WEBHOOK_BYTES);
      if (!validSignature(whatsapp.appSecret, body, request.headers.get("x-hub-signature-256")))
        throw new AppError(401, "unauthorized", "bad signature");
      // From here on the answer is always 200: Meta retries anything else, and a bad update is not worth a retry storm.
      // The body is read for what it says and never stored or logged.
      try {
        const payload = JSON.parse(new TextDecoder().decode(body)) as { entry?: { changes?: { value?: WebhookValue }[] }[] };
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) if (change.value) await applyValue(app, change.value, now);
        }
      } catch {
        // Not JSON, or not the shape we expect.
      }
      return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
    },
  },
];
