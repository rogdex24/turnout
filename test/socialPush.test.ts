import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
  getDevice,
  MAX_DEVICES_PER_MEMBER,
  memberDevices,
  registerDevice,
  removeDevice,
  removeSessionDevices,
} from "../src/social/devices.js";
import { addNotice, getNotice, listNotices, markNoticesRead } from "../src/social/notices.js";
import { expireReceipts, planPushes, receiptsDue, recordPushResults, recordReceipt } from "../src/social/pushes.js";
import { revokeAllSessions, rotateSession } from "../src/social/sessions.js";
import { seedMember, seedSession } from "./helpers/socialFixture.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-11-01T06:00:00Z");
const MIN = 60_000;
const after = (ms: number) => new Date(NOW.getTime() + ms);

function setup() {
  const db = memoryDb();
  const memberId = seedMember(db, NOW);
  return { db, memberId, sessionId: seedSession(db, memberId, NOW) };
}

function notice(db: Database, memberId: string, key: string, kind: "ticket_approved" | "head_over" = "ticket_approved", when = NOW) {
  const id = addNotice(db, { memberId, kind, planId: null, groupId: null, dedupeKey: key, now: when });
  if (id === null) throw new Error("duplicate");
  return id;
}

const token = (n: number) => `ExponentPushToken[token-${n}]`;

test("a device registers once per token and moves with the phone", () => {
  const { db, memberId, sessionId } = setup();
  const first = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const again = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: after(MIN) });
  expect(again.id).toBe(first.id);
  expect(again.last_seen_at).toBe(after(MIN).toISOString());
  const other = seedMember(db, NOW);
  const otherSession = seedSession(db, other, NOW);
  const moved = registerDevice(db, { memberId: other, sessionId: otherSession, expoToken: token(1), platform: "ios", now: after(2 * MIN) });
  expect(moved).toMatchObject({ id: first.id, member_id: other, session_id: otherSession, platform: "ios" });
  expect(memberDevices(db, memberId)).toEqual([]);
});

test("a member keeps at most ten devices, the stalest dropped", () => {
  const { db, memberId, sessionId } = setup();
  for (let i = 0; i < MAX_DEVICES_PER_MEMBER + 2; i++) {
    registerDevice(db, { memberId, sessionId, expoToken: token(i), platform: "android", now: after(i * MIN) });
  }
  const kept = memberDevices(db, memberId).map((d) => d.expo_token);
  expect(kept).toHaveLength(MAX_DEVICES_PER_MEMBER);
  expect(kept).not.toContain(token(0));
  expect(kept).toContain(token(MAX_DEVICES_PER_MEMBER + 1));
});

test("removing a device is for its owner, and a stranger's id answers the same as a missing one", () => {
  const { db, memberId, sessionId } = setup();
  const device = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const stranger = seedMember(db, NOW);
  expect(removeDevice(db, stranger, device.id)).toBe(false);
  expect(removeDevice(db, memberId, "nope")).toBe(false);
  expect(removeDevice(db, memberId, device.id)).toBe(true);
  expect(getDevice(db, device.id)).toBeNull();
});

test("a device follows the session when it rotates, and goes at sign-out", () => {
  const { db, memberId, sessionId } = setup();
  const device = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const rotated = rotateSession(db, { oldId: sessionId, id: "s2", memberId, refreshHash: "h2", now: after(MIN), refreshDays: 30 });
  expect(rotated).toBe(true);
  expect(getDevice(db, device.id)?.session_id).toBe("s2");
  expect(removeSessionDevices(db, "s2")).toBe(1);
  expect(memberDevices(db, memberId)).toEqual([]);
  const other = registerDevice(db, { memberId, sessionId: "s2", expoToken: token(2), platform: "android", now: NOW });
  expect(revokeAllSessions(db, memberId, NOW)).toBeGreaterThan(0);
  expect(getDevice(db, other.id)).toBeNull();
});

test("notices page by id, mark read up to a point, and keep a stale one in the list", () => {
  const { db, memberId } = setup();
  const a = notice(db, memberId, "a");
  const b = notice(db, memberId, "b", "head_over", after(MIN));
  const c = notice(db, memberId, "c", "ticket_approved", after(2 * MIN));
  expect(listNotices(db, memberId, undefined).map((n) => n.id)).toEqual([a, b, c]);
  expect(listNotices(db, memberId, a).map((n) => n.id)).toEqual([b, c]);
  expect(listNotices(db, memberId, undefined, 2).map((n) => n.id)).toEqual([a, b]);
  expect(markNoticesRead(db, memberId, b, after(5 * MIN))).toBe(2);
  expect(markNoticesRead(db, memberId, b, after(6 * MIN))).toBe(0);
  expect(getNotice(db, a)?.read_at).toBe(after(5 * MIN).toISOString());
  expect(getNotice(db, c)?.read_at).toBeNull();
  const stranger = seedMember(db, NOW);
  expect(listNotices(db, stranger, undefined)).toEqual([]);
  expect(markNoticesRead(db, stranger, c, NOW)).toBe(0);
});

test("a pending notice becomes a job for the member's sending devices", () => {
  const { db, memberId, sessionId } = setup();
  const d = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const id = notice(db, memberId, "a");
  const plan = planPushes(db, after(MIN), ["android"]);
  expect(plan.skipped).toEqual([]);
  expect(plan.jobs.map((j) => [j.notice.id, j.devices.map((x) => x.id)])).toEqual([[id, [d.id]]]);
  expect(recordPushResults(db, id, [{ deviceId: d.id, ticketId: "t1", errorCode: null, gone: false }], after(MIN))).toBe("sent");
  expect(getNotice(db, id)).toMatchObject({ push_state: "sent", pushed_at: after(MIN).toISOString() });
  expect(planPushes(db, after(2 * MIN), ["android"]).jobs).toEqual([]);
});

test("a member on iOS only gets the notice in the list and no send", () => {
  const { db, memberId, sessionId } = setup();
  registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "ios", now: NOW });
  const id = notice(db, memberId, "a");
  expect(planPushes(db, after(MIN), ["android"])).toEqual({ jobs: [], skipped: [{ noticeId: id, state: "not_sent" }] });
  expect(getNotice(db, id)?.push_state).toBe("not_sent");
  expect(listNotices(db, memberId, undefined)).toHaveLength(1);
});

test("a member with no device is closed as no_device", () => {
  const { db, memberId } = setup();
  const id = notice(db, memberId, "a");
  expect(planPushes(db, after(MIN), ["android"]).skipped).toEqual([{ noticeId: id, state: "no_device" }]);
});

test("a notice past its time is closed as stale and not sent, yet still listed", () => {
  const { db, memberId, sessionId } = setup();
  registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const id = notice(db, memberId, "late", "head_over");
  expect(planPushes(db, after(19 * MIN), ["android"]).jobs).toHaveLength(1);
  const plan = planPushes(db, after(20 * MIN), ["android"]);
  expect(plan.jobs).toEqual([]);
  expect(plan.skipped).toEqual([{ noticeId: id, state: "stale" }]);
  expect(listNotices(db, memberId, undefined).map((n) => n.id)).toEqual([id]);
});

test("when Expo refuses and the device is gone, the device is switched off and the notice closed", () => {
  const { db, memberId, sessionId } = setup();
  const d1 = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const d2 = registerDevice(db, { memberId, sessionId, expoToken: token(2), platform: "android", now: after(MIN) });
  const id = notice(db, memberId, "a");
  const failed = recordPushResults(
    db,
    id,
    [
      { deviceId: d1.id, ticketId: null, errorCode: "DeviceNotRegistered", gone: true },
      { deviceId: d2.id, ticketId: null, errorCode: "MessageRateExceeded", gone: false },
    ],
    after(2 * MIN),
  );
  expect(failed).toBe("pending");
  expect(getDevice(db, d1.id)?.disabled_at).not.toBeNull();
  expect(getDevice(db, d2.id)?.disabled_at).toBeNull();
  expect(planPushes(db, after(3 * MIN), ["android"]).jobs[0]?.devices.map((d) => d.id)).toEqual([d2.id]);
  expect(
    recordPushResults(db, id, [{ deviceId: d2.id, ticketId: null, errorCode: "DeviceNotRegistered", gone: true }], after(3 * MIN)),
  ).toBe("no_device");
  expect(getNotice(db, id)?.push_state).toBe("no_device");
});

test("receipts: delivered, device gone, and no answer for two days", () => {
  const { db, memberId, sessionId } = setup();
  const d1 = registerDevice(db, { memberId, sessionId, expoToken: token(1), platform: "android", now: NOW });
  const d2 = registerDevice(db, { memberId, sessionId, expoToken: token(2), platform: "android", now: NOW });
  const d3 = registerDevice(db, { memberId, sessionId, expoToken: token(3), platform: "android", now: NOW });
  const id = notice(db, memberId, "a");
  recordPushResults(
    db,
    id,
    [d1, d2, d3].map((d, i) => ({ deviceId: d.id, ticketId: `t${i}`, errorCode: null, gone: false })),
    NOW,
  );
  expect(receiptsDue(db, after(14 * MIN), 15)).toEqual([]);
  const due = receiptsDue(db, after(15 * MIN), 15);
  expect(due.map((x) => x.ticketId)).toEqual(["t0", "t1", "t2"]);
  recordReceipt(db, due[0] as (typeof due)[0], { ok: true }, after(16 * MIN));
  recordReceipt(db, due[1] as (typeof due)[0], { ok: false, errorCode: "DeviceNotRegistered", gone: true }, after(16 * MIN));
  const status = () =>
    (db.query("SELECT status FROM push_delivery ORDER BY expo_ticket_id").all() as { status: string }[]).map((r) => r.status);
  expect(status()).toEqual(["delivered", "device_gone", "ticketed"]);
  expect(getDevice(db, d2.id)?.disabled_at).not.toBeNull();
  expect(getDevice(db, d1.id)?.disabled_at).toBeNull();
  // A receipt that arrives twice changes nothing.
  recordReceipt(db, due[0] as (typeof due)[0], { ok: false, errorCode: "x", gone: false }, after(17 * MIN));
  expect(status()).toEqual(["delivered", "device_gone", "ticketed"]);
  expect(expireReceipts(db, after(47 * 60 * MIN))).toBe(0);
  expect(expireReceipts(db, after(48 * 60 * MIN + 1))).toBe(1);
  expect(status()).toEqual(["delivered", "device_gone", "failed"]);
  expect(receiptsDue(db, after(100 * 60 * MIN), 15)).toEqual([]);
});

test("the push record holds the notice, the device and Expo's answer, nothing from the notice's text", () => {
  const { db } = setup();
  const columns = (db.query("PRAGMA table_info(push_delivery)").all() as { name: string }[]).map((c) => c.name);
  expect(columns).toEqual(["id", "notice_id", "device_id", "expo_ticket_id", "status", "error_code", "created_at", "receipt_checked_at"]);
});
