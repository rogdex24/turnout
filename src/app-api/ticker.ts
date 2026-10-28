import { NOTICE_PUSH_TEXT } from "@turnout/contract/app/notices";
import { expireReceipts, type PushResult, planPushes, receiptsDue, recordPushResults, recordReceipt } from "../social/pushes.js";
import { acquireLease, finishLease, TICK_LEASE, tick } from "../social/tick.js";
import { dueTicketFiles, markTicketFileDeleted } from "../social/tickets.js";
import type { AppContext } from "./context.js";
import { housekeeping } from "./housekeeping.js";
import type { PushMessage } from "./vendors/push.js";

export interface PassResult {
  /** False when another process held the lease, so this one did nothing. */
  ran: boolean;
}

function logFailure(app: AppContext, step: string, error: unknown): void {
  app.log({
    at: app.now().toISOString(),
    method: "TICK",
    route: step,
    status: 500,
    ms: 0,
    error: error instanceof Error ? error.name : "unknown",
  });
}

/** Sends the pending notices. A send that cannot reach the push service leaves them pending, to be tried again until they go stale. */
async function sendPushes(app: AppContext, now: Date): Promise<void> {
  const platforms = (["android", "ios"] as const).filter((p) => app.config.push[p]);
  const plan = planPushes(app.db, now, platforms);
  const messages: PushMessage[] = [];
  const owners: { noticeId: string; deviceId: string }[] = [];
  for (const { notice, devices } of plan.jobs) {
    const text = NOTICE_PUSH_TEXT[notice.kind];
    const ttlSeconds = Math.max(60, Math.floor((Date.parse(notice.stale_after) - now.getTime()) / 1000));
    for (const device of devices) {
      messages.push({
        token: device.expo_token,
        title: text.title,
        body: text.body,
        data: { kind: notice.kind, noticeId: notice.id, planId: notice.plan_id },
        ttlSeconds,
      });
      owners.push({ noticeId: notice.id, deviceId: device.id });
    }
  }
  if (messages.length === 0) return;
  const answers = await app.push.send(messages);
  const byNotice = new Map<string, PushResult[]>();
  answers.forEach((answer, index) => {
    const owner = owners[index];
    if (owner === undefined) return;
    const result: PushResult = answer.ok
      ? { deviceId: owner.deviceId, ticketId: answer.ticketId, errorCode: null, gone: false }
      : { deviceId: owner.deviceId, ticketId: null, errorCode: answer.errorCode, gone: answer.gone };
    byNotice.set(owner.noticeId, [...(byNotice.get(owner.noticeId) ?? []), result]);
  });
  for (const [noticeId, results] of byNotice) recordPushResults(app.db, noticeId, results, now);
}

/** Reads the receipts Expo has by now, once each, and switches off devices that are gone. */
async function readReceipts(app: AppContext, now: Date): Promise<void> {
  const due = receiptsDue(app.db, now, app.config.tunables.ticker.receiptDelayMinutes);
  if (due.length > 0) {
    const found = await app.push.receipts(due.map((d) => d.ticketId));
    for (const item of due) {
      const outcome = found.get(item.ticketId);
      if (outcome !== undefined) recordReceipt(app.db, item, outcome, now);
    }
  }
  expireReceipts(app.db, now);
}

/** Deletes the ticket files that must not be kept any longer. A file the store cannot drop is tried again on the next pass. */
async function deleteTicketFiles(app: AppContext, now: Date): Promise<void> {
  for (const file of dueTicketFiles(app.db, now, app.config.tunables)) {
    try {
      await app.store.delete(file.objectKey);
      markTicketFileDeleted(app.db, file.ticketId, now);
    } catch (error) {
      logFailure(app, "ticket-file-delete", error);
    }
  }
}

/**
 * One pass of the ticker: the clock-driven changes, the operator alerts, the pushes, the receipts, the ticket-file deletion and
 * the housekeeping. Only the process that holds the lease runs it; the lease is given up when the pass ends. Each step is
 * independent, so one failing (the push service is down) does not stop the others.
 */
export async function runTickerPass(app: AppContext, holder: string): Promise<PassResult> {
  const t = app.config.tunables;
  const start = app.now();
  if (!acquireLease(app.db, TICK_LEASE, holder, start, t.ticker.leaseSeconds)) return { ran: false };
  const steps: [string, () => unknown][] = [
    [
      "tick",
      async () => {
        for (const alert of tick(app.db, app.now(), t).alerts) await app.alerts.notify(alert.key, alert.text);
      },
    ],
    ["push", () => sendPushes(app, app.now())],
    ["receipts", () => readReceipts(app, app.now())],
    ["ticket-files", () => deleteTicketFiles(app, app.now())],
    ["housekeeping", () => housekeeping(app)],
  ];
  try {
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        logFailure(app, name, error);
      }
    }
  } finally {
    finishLease(app.db, TICK_LEASE, holder, app.now());
  }
  return { ran: true };
}

/** Background work for the app API, every 30 seconds. `serve --no-ticker` skips it. Returns a function that stops it. */
export function startTicker(app: AppContext): () => void {
  const holder = `${process.pid}:${crypto.randomUUID()}`;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runTickerPass(app, holder)
      .catch((error) => logFailure(app, "pass", error))
      .finally(() => {
        running = false;
      });
  }, app.config.tunables.ticker.intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
