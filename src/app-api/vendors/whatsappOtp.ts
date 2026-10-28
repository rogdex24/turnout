import type { FetchLike } from "../../utils/http.js";
import type { WhatsAppConfig } from "../env.js";
import type { OtpSender, SendResult } from "./otpSender.js";

export const GRAPH_VERSION = "v26.0";

/**
 * Sends the code through a WhatsApp authentication template (the Cloud API). The code goes in the body parameter and in the
 * template's copy-code button, which is how an authentication template is built. The provider's answer is turned into a result;
 * nothing from the request (phone, code, token) is logged or put in an error.
 */
export function whatsappOtpSender(config: WhatsAppConfig, fetch: FetchLike): OtpSender {
  return {
    async send({ phone, code }): Promise<SendResult> {
      const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        // The Cloud API takes the number as digits, without the plus.
        to: phone.replace(/^\+/, ""),
        type: "template",
        template: {
          name: config.templateName,
          language: { code: "en" },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      };
      let response: Response;
      try {
        response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        return { ok: false, errorCode: null };
      }
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        // A body that is not JSON is handled below as a failure with no code.
      }
      const record = (json ?? {}) as { messages?: { id?: unknown }[]; error?: { code?: unknown } };
      const wamid = record.messages?.[0]?.id;
      if (response.ok && typeof wamid === "string") return { ok: true, wamid };
      const code_ = record.error?.code;
      return { ok: false, errorCode: typeof code_ === "number" || typeof code_ === "string" ? String(code_) : null };
    },
  };
}
