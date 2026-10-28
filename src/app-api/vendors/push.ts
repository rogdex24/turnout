import type { PushPayload } from "@turnout/contract/app/notices";

/** One push to one device. The title and body are the fixed generic text for the kind; the data is ids and the kind only. */
export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: PushPayload;
  /** How long the push service keeps trying, so a late push is never delivered after its notice went stale. */
  ttlSeconds: number;
}

/** What the push service said about one message. */
export type PushSendResult = { ok: true; ticketId: string } | { ok: false; errorCode: string; gone: boolean };

/** What the push service said about one delivery, some time after the send. */
export type PushReceiptResult = { ok: true } | { ok: false; errorCode: string; gone: boolean };

export interface PushSender {
  /** One result per message, in the same order. Throws when the service could not be reached: nothing was sent and the caller tries again. */
  send(messages: readonly PushMessage[]): Promise<PushSendResult[]>;
  /** The receipts the service has for these ticket ids. An id it has no receipt for yet is left out. */
  receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceiptResult>>;
}

/**
 * The sender for tests, development and staging. It sends nothing; it keeps what it was asked to send so a test can read it.
 * `failTokens` makes a token answer with an error, `unreachable` makes the whole send throw, and `receiptFor` sets the receipt
 * that comes back for a ticket (a ticket with no entry has no receipt yet).
 */
export interface FakePushSender extends PushSender {
  readonly fake: true;
  readonly sent: PushMessage[];
  /** Tokens that answer with this error code; `DeviceNotRegistered` also means the device is gone. */
  failTokens: Map<string, string>;
  unreachable: boolean;
  receiptFor: Map<string, PushReceiptResult>;
}

export function fakePushSender(): FakePushSender {
  const sent: PushMessage[] = [];
  const sender: FakePushSender = {
    fake: true,
    sent,
    failTokens: new Map(),
    unreachable: false,
    receiptFor: new Map(),
    async send(messages) {
      if (sender.unreachable) throw new Error("push service unreachable");
      return messages.map((message): PushSendResult => {
        const errorCode = sender.failTokens.get(message.token);
        if (errorCode !== undefined) return { ok: false, errorCode, gone: errorCode === "DeviceNotRegistered" };
        sent.push(message);
        return { ok: true, ticketId: `ticket.fake.${sent.length}` };
      });
    },
    async receipts(ticketIds) {
      if (sender.unreachable) throw new Error("push service unreachable");
      const out = new Map<string, PushReceiptResult>();
      for (const id of ticketIds) {
        const receipt = sender.receiptFor.get(id);
        if (receipt !== undefined) out.set(id, receipt);
      }
      return out;
    },
  };
  return sender;
}
