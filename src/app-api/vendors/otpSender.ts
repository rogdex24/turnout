/** What a sender says about one code message. `wamid` is the provider's message id, the key the delivery webhook reports against. */
export type SendResult =
  | { ok: true; wamid: string; deliveryStatus?: "sent" | "undeliverable"; errorCode?: string }
  | { ok: false; errorCode: string | null };

/** Sends the sign-in code. The code reaches the sender and nothing else: it is not logged anywhere. */
export interface OtpSender {
  send(input: { phone: string; code: string }): Promise<SendResult>;
}

/**
 * The sender for tests, development and staging. It sends nothing; it keeps the last code per phone so a test (or the staging
 * `__test/otp` route) can read it. `undeliverablePhones` mimics a number WhatsApp cannot reach, and `failWith` a provider error.
 */
export interface FakeOtpSender extends OtpSender {
  /** Marks the sender as one that sends nothing, so a production start can refuse it. */
  readonly fake: true;
  readonly sent: { phone: string; code: string; wamid: string }[];
  lastCode(phone: string): string | null;
  undeliverablePhones: Set<string>;
  /** When set, every send fails with this provider error code. */
  failWith: string | null;
}

export function fakeOtpSender(): FakeOtpSender {
  const sent: FakeOtpSender["sent"] = [];
  const last = new Map<string, string>();
  const sender: FakeOtpSender = {
    fake: true,
    sent,
    undeliverablePhones: new Set(),
    failWith: null,
    lastCode: (phone) => last.get(phone) ?? null,
    async send({ phone, code }) {
      if (sender.failWith !== null) return { ok: false, errorCode: sender.failWith };
      const wamid = `wamid.fake.${sent.length + 1}`;
      sent.push({ phone, code, wamid });
      last.set(phone, code);
      if (sender.undeliverablePhones.has(phone)) return { ok: true, wamid, deliveryStatus: "undeliverable", errorCode: "131026" };
      return { ok: true, wamid };
    },
  };
  return sender;
}
