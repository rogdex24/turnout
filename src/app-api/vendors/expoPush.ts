import Expo, { type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from "expo-server-sdk";
import type { PushReceiptResult, PushSender, PushSendResult } from "./push.js";

const GONE = "DeviceNotRegistered";

/** An Expo send ticket as a result. An error ticket carries Expo's error name and nothing from the message. */
export function ticketResult(ticket: ExpoPushTicket | undefined): PushSendResult {
  if (ticket === undefined) return { ok: false, errorCode: "no_ticket", gone: false };
  if (ticket.status === "ok") return { ok: true, ticketId: ticket.id };
  const errorCode = ticket.details?.error ?? "ExpoError";
  return { ok: false, errorCode, gone: errorCode === GONE };
}

/** An Expo receipt as a result. */
export function receiptResult(receipt: ExpoPushReceipt): PushReceiptResult {
  if (receipt.status === "ok") return { ok: true };
  const errorCode = receipt.details?.error ?? "ExpoError";
  return { ok: false, errorCode, gone: errorCode === GONE };
}

/**
 * Sends through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/). Messages go out in the
 * chunks the SDK sizes, and each message's ticket is matched back by position. The access token is optional: it is needed only when
 * the Expo project turns on enhanced push security.
 */
export function expoPushSender(accessToken: string | null): PushSender {
  const client = new Expo(accessToken === null ? {} : { accessToken });
  return {
    async send(messages) {
      const results: PushSendResult[] = [];
      const wire: ExpoPushMessage[] = messages.map((m) => ({
        to: m.token,
        title: m.title,
        body: m.body,
        data: { ...m.data },
        ttl: m.ttlSeconds,
        priority: "high",
        sound: "default",
      }));
      for (const chunk of client.chunkPushNotifications(wire)) {
        const tickets = await client.sendPushNotificationsAsync(chunk);
        for (let index = 0; index < chunk.length; index += 1) results.push(ticketResult(tickets[index]));
      }
      return results;
    },
    async receipts(ticketIds) {
      const out = new Map<string, PushReceiptResult>();
      for (const chunk of client.chunkPushNotificationReceiptIds([...ticketIds])) {
        const found = await client.getPushNotificationReceiptsAsync(chunk);
        for (const [id, receipt] of Object.entries(found)) out.set(id, receiptResult(receipt));
      }
      return out;
    },
  };
}
