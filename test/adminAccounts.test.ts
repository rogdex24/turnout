import { describe, expect, test } from "bun:test";
import type { AdminFiles } from "../src/admin/files.js";
import { type AdminContext, apiResponse } from "../src/admin/server.js";
import type { AccountDetail, ReportItem } from "../src/social/adminReads.js";
import { banReason, isPhoneRefused, writeBan } from "../src/social/bans.js";
import { getMember } from "../src/social/members.js";
import { addNotice } from "../src/social/notices.js";
import { tick } from "../src/social/tick.js";
import { memoryStore } from "../src/utils/objectStore.js";
import type { TestApp } from "./appHelpers.js";
import type { Session } from "./helpers/appFixture.js";
import { type Setup, setup } from "./helpers/groupFixture.js";
import { SHOW_START } from "./helpers/socialFixture.js";

const HOUR = 3_600_000;
const START = Date.parse(SHOW_START);
const OPEN = -3 * HOUR;
const TOKEN = "admin-token-for-tests";
const SECRET = "link-secret-for-tests-0123456789abcdef";

interface Rig extends Setup {
  files: AdminFiles;
  call(method: string, path: string, body?: unknown, options?: { token?: string | null }): Promise<Response>;
  /** The reports the app route took, newest last. */
  reportIds(): string[];
}

let clientCounter = 0;
const nextClient = () => `admin-client-${String(++clientCounter).padStart(6, "0")}`;

/** Four people in a group (woman, man, woman, man) at T-3h, and an admin context over the same database. */
async function rig(options: { pepper?: string | null } = {}): Promise<Rig> {
  const s = await setup();
  await s.at(OPEN);
  const files: AdminFiles = { store: memoryStore({ now: () => s.t.clock(), link: (key) => key }), secret: SECRET, ttlSeconds: 300 };
  const ctx: AdminContext = {
    read: s.t.db,
    write: s.t.db,
    agentRunsDir: "/nonexistent",
    token: TOKEN,
    files,
    banPepper: options.pepper === undefined ? s.t.app.config.banPepper : options.pepper,
    now: () => s.t.clock(),
    startRun: () => ({ runId: "r", logPath: "x" }),
  };
  return {
    ...s,
    files,
    call: (method, path, body, o = {}) =>
      apiResponse(
        ctx,
        new Request(`http://127.0.0.1:3001${path}`, {
          method,
          headers: {
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...(o.token === null ? {} : { authorization: `Bearer ${o.token ?? TOKEN}` }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      ),
    reportIds: () => (s.t.db.query("SELECT id FROM report ORDER BY id").all() as { id: string }[]).map((r) => r.id),
  };
}

const refOf = (s: Setup, who: Session): string =>
  (
    s.t.db.query("SELECT member_ref AS ref FROM group_member WHERE group_id = ? AND member_id = ?").get(s.groupId, who.memberId) as {
      ref: string;
    }
  ).ref;

/** A report through the app route, so the rows are exactly what the app writes. */
async function fileReport(s: Setup, by: Session, about: Session): Promise<string> {
  const response = await s.t.call("POST", "/reports", {
    token: by.token,
    body: { groupId: s.groupId, memberRef: refOf(s, about), body: "They made me uncomfortable.", clientId: nextClient() },
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { reportId: string }).reportId;
}

const actions = (t: TestApp, action: string) =>
  t.db.query("SELECT * FROM operator_action WHERE action = ? ORDER BY id").all(action) as {
    id: string;
    action: string;
    subject_type: string;
    subject_id: string;
    detail: string | null;
  }[];
const reportRow = (t: TestApp, id: string) => t.db.query("SELECT * FROM report WHERE id = ?").get(id) as Record<string, string | null>;
const errorText = async (response: Response) => ((await response.json()) as { error: string }).error;

describe("admin reports", () => {
  test("the queue lists open reports with the due time, both people's history and the thread", async () => {
    const s = await rig();
    const [a, b, c] = s.members as [Session, Session, Session];
    // b sends a message before being reported, c answers.
    const sent = await s.t.call("POST", `/groups/${s.groupId}/messages`, {
      token: b.token,
      body: { body: "Running late", clientId: nextClient() },
    });
    expect(sent.status).toBe(201);
    const messageId = ((await sent.json()) as { id: string }).id;
    await s.t.call("POST", `/groups/${s.groupId}/messages`, { token: c.token, body: { body: "Okay", clientId: nextClient() } });
    const reportId = await fileReport(s, a, b);
    s.t.db.query("UPDATE report SET message_id = ? WHERE id = ?").run(messageId, reportId);

    const response = await s.call("GET", "/api/reports");
    expect(response.status).toBe(200);
    const { reports } = (await response.json()) as { reports: ReportItem[] };
    expect(reports).toHaveLength(1);
    const item = reports[0] as ReportItem;
    expect(item).toMatchObject({
      reportId,
      groupId: s.groupId,
      body: "They made me uncomfortable.",
      minutesToDue: 24 * 60,
      overdue: false,
      contactRequired: true,
      contactedReporterAt: null,
      reporterPhone: a.phone,
    });
    expect(item.dueAt).toBe(reportRow(s.t, reportId).due_at as string);
    expect(item.reporter).toMatchObject({ memberId: a.memberId, firstName: "Person0", gender: "woman", status: "active", reportsMade: 1 });
    expect(item.subject).toMatchObject({
      memberId: b.memberId,
      firstName: "Person1",
      gender: "man",
      status: "suspended",
      reportsAbout: { open: 1, upheld: 0, dismissed: 0 },
      downvotesReceived: 0,
    });
    expect(item.thread.map((m) => [m.from, m.body, m.reported])).toEqual([
      ["subject", "Running late", true],
      ["other", "Okay", false],
    ]);
    // The group's opaque names are not in the thread.
    expect(JSON.stringify(item.thread)).not.toContain(refOf(s, b));
  });

  test("an overdue report shows a negative time and sorts ahead of a newer one", async () => {
    const s = await rig();
    const [a, b, c] = s.members as [Session, Session, Session];
    const first = await fileReport(s, a, b);
    s.t.clock.set(new Date(START + OPEN + 30 * HOUR));
    tick(s.t.db, s.t.clock());
    c.token = (await s.t.signIn(c.phone)).accessToken;
    const second = await fileReport(s, c, s.members[3] as Session);
    const { reports } = (await (await s.call("GET", "/api/reports")).json()) as {
      reports: { reportId: string; overdue: boolean; minutesToDue: number }[];
    };
    expect(reports.map((r) => r.reportId)).toEqual([first, second]);
    expect(reports[0]).toMatchObject({ overdue: true, minutesToDue: -6 * 60 });
    expect(reports[1]).toMatchObject({ overdue: false, minutesToDue: 24 * 60 });
  });

  test("contacted sets the time once and writes one action row", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    const first = await s.call("POST", `/api/reports/${id}/contacted`);
    expect(first.status).toBe(200);
    expect(reportRow(s.t, id).contacted_reporter_at).toBe(s.t.clock().toISOString());
    s.t.clock.set(new Date(s.t.clock().getTime() + HOUR));
    expect((await s.call("POST", `/api/reports/${id}/contacted`)).status).toBe(200);
    expect(reportRow(s.t, id).contacted_reporter_at).not.toBe(s.t.clock().toISOString());
    expect(actions(s.t, "report_contacted")).toMatchObject([{ subject_type: "report", subject_id: id }]);
    expect((await s.call("POST", "/api/reports/no-such-report/contacted")).status).toBe(404);
  });

  test("a woman's report about a man cannot be closed before she was contacted: 409, nothing written", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    const response = await s.call("POST", `/api/reports/${id}/close`, { outcome: "dismissed", note: "Nothing found." });
    expect(response.status).toBe(409);
    expect(await errorText(response)).toContain("contact the reporter");
    expect(reportRow(s.t, id)).toMatchObject({ status: "open", outcome: null, close_note: null });
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");
    expect(actions(s.t, "report_close")).toHaveLength(0);
  });

  test("upheld: the report closes, the account is erased and banned, the files go, the action row carries the outcome and no note", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    await s.files.store.put(`photos/${b.memberId}.jpg`, new Uint8Array([1, 2, 3]), "image/jpeg");
    await s.call("POST", `/api/reports/${id}/contacted`);
    const response = await s.call("POST", `/api/reports/${id}/close`, { outcome: "upheld", note: "Confirmed with both people." });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reportId: id, status: "closed", outcome: "upheld" });
    expect(reportRow(s.t, id)).toMatchObject({ status: "closed", outcome: "upheld", close_note: "Confirmed with both people." });
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "deleted", phone_e164: null });
    expect(banReason(s.t.db, s.t.app.config.banPepper, b.phone)).toBe("report_upheld");
    expect(isPhoneRefused(s.t.db, s.t.app.config.banPepper, b.phone)).toBe(true);
    expect(await s.files.store.get(`photos/${b.memberId}.jpg`)).toBeNull();
    const rows = actions(s.t, "report_close");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subject_type: "report", subject_id: id });
    expect(JSON.parse(rows[0]?.detail as string)).toEqual({ outcome: "upheld" });
    expect(JSON.stringify(s.t.db.query("SELECT * FROM operator_action").all())).not.toContain("Confirmed with both people");
    // Closing twice is a 409.
    expect((await s.call("POST", `/api/reports/${id}/close`, { outcome: "upheld", note: "again" })).status).toBe(409);
  });

  test("dismissed: the report closes and the account is back to active, with an action row", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    await s.call("POST", `/api/reports/${id}/contacted`);
    const response = await s.call("POST", `/api/reports/${id}/close`, { outcome: "dismissed", note: "Not a breach." });
    expect(response.status).toBe(200);
    expect(reportRow(s.t, id)).toMatchObject({ status: "closed", outcome: "dismissed" });
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "active", status_reason: null });
    expect(JSON.parse(actions(s.t, "report_close")[0]?.detail as string)).toEqual({ outcome: "dismissed" });
    expect(await s.t.call("GET", "/me", { token: (await s.t.signIn(b.phone)).accessToken })).toHaveProperty("status", 200);
  });

  test("a man's report about a woman closes without the contact step", async () => {
    const s = await rig();
    const [, b, c] = s.members as [Session, Session, Session];
    const id = await fileReport(s, b, c);
    expect((await s.call("POST", `/api/reports/${id}/close`, { outcome: "dismissed", note: "No breach." })).status).toBe(200);
  });

  test("a body with an unknown field, a bad outcome or no note is 400 and changes nothing", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    await s.call("POST", `/api/reports/${id}/contacted`);
    for (const body of [
      { outcome: "upheld", note: "x", extra: 1 },
      { outcome: "maybe", note: "x" },
      { outcome: "upheld" },
      { outcome: "upheld", note: "   " },
      { outcome: "upheld", note: "x".repeat(2001) },
    ]) {
      expect((await s.call("POST", `/api/reports/${id}/close`, body)).status).toBe(400);
    }
    expect(reportRow(s.t, id).status).toBe("open");
    expect(actions(s.t, "report_close")).toHaveLength(0);
    expect((await s.call("POST", "/api/reports/no-such/close", { outcome: "dismissed", note: "x" })).status).toBe(404);
  });

  test("without the ban pepper an upheld close is 503 and nothing changes", async () => {
    const s = await rig({ pepper: null });
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    await s.call("POST", `/api/reports/${id}/contacted`);
    expect((await s.call("POST", `/api/reports/${id}/close`, { outcome: "upheld", note: "x" })).status).toBe(503);
    expect(reportRow(s.t, id).status).toBe("open");
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");
  });
});

describe("admin accounts", () => {
  test("suspend: signed out, plans withdrawn, a 403 on the next call, one action row", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const response = await s.call("POST", `/api/accounts/${b.memberId}/suspend`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ memberId: b.memberId, status: "suspended" });
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "suspended", status_reason: "operator" });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM auth_session WHERE member_id = ? AND revoked_at IS NULL").get(b.memberId)).toEqual({
      n: 0,
    });
    expect(s.t.db.query("SELECT state FROM plan WHERE member_id = ?").all(b.memberId)).toEqual([{ state: "withdrawn" }]);
    expect((await s.t.call("GET", "/me", { token: b.token })).status).toBe(403);
    expect((await s.t.call("GET", "/me", { token: a.token })).status).toBe(200);
    expect(actions(s.t, "member_suspend")).toMatchObject([{ subject_type: "member", subject_id: b.memberId }]);
    // A second suspend is refused and writes nothing more.
    expect((await s.call("POST", `/api/accounts/${b.memberId}/suspend`)).status).toBe(409);
    expect(actions(s.t, "member_suspend")).toHaveLength(1);
    expect((await s.call("POST", "/api/accounts/nobody/suspend")).status).toBe(404);
  });

  test("reinstate puts the account back and writes an action row; withdrawn plans stay withdrawn", async () => {
    const s = await rig();
    const b = s.members[1] as Session;
    await s.call("POST", `/api/accounts/${b.memberId}/suspend`);
    const response = await s.call("POST", `/api/accounts/${b.memberId}/reinstate`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ memberId: b.memberId, status: "active" });
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "active", status_reason: null });
    expect(s.t.db.query("SELECT state FROM plan WHERE member_id = ?").all(b.memberId)).toEqual([{ state: "withdrawn" }]);
    expect(actions(s.t, "member_reinstate")).toMatchObject([{ subject_type: "member", subject_id: b.memberId }]);
    expect((await s.t.call("GET", "/me", { token: (await s.t.signIn(b.phone)).accessToken })).status).toBe(200);
    // An active account cannot be reinstated.
    expect((await s.call("POST", `/api/accounts/${b.memberId}/reinstate`)).status).toBe(409);
  });

  test("reinstate is refused while a report about the account is open", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    await fileReport(s, a, b);
    const response = await s.call("POST", `/api/accounts/${b.memberId}/reinstate`);
    expect(response.status).toBe(409);
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");
    expect(actions(s.t, "member_reinstate")).toHaveLength(0);
  });

  test("ban: the account is erased, the number is on the list, the files go, one action row", async () => {
    const s = await rig();
    const b = s.members[1] as Session;
    await s.files.store.put(`photos/${b.memberId}.jpg`, new Uint8Array([1]), "image/jpeg");
    const response = await s.call("POST", `/api/accounts/${b.memberId}/ban`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ memberId: b.memberId, status: "banned" });
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "deleted", status_reason: "ban", phone_e164: null });
    expect(banReason(s.t.db, s.t.app.config.banPepper, b.phone)).toBe("operator");
    expect(await s.files.store.get(`photos/${b.memberId}.jpg`)).toBeNull();
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 1 });
    expect(actions(s.t, "member_ban")).toMatchObject([{ subject_type: "member", subject_id: b.memberId }]);
    expect((await s.t.call("POST", "/auth/otp", { body: { phone: b.phone, purpose: "sign_in" } })).status).toBe(403);
    expect((await s.call("POST", `/api/accounts/${b.memberId}/ban`)).status).toBe(404);
  });

  test("ban without the pepper is 503 and the account is untouched", async () => {
    const s = await rig({ pepper: null });
    const b = s.members[1] as Session;
    expect((await s.call("POST", `/api/accounts/${b.memberId}/ban`)).status).toBe(503);
    expect(getMember(s.t.db, b.memberId)?.status).toBe("active");
    expect(actions(s.t, "member_ban")).toHaveLength(0);
  });

  test("the account page shows status, plans, reports and what the operator did, and 404s for nobody", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    const response = await s.call("GET", `/api/accounts/${b.memberId}`);
    expect(response.status).toBe(200);
    const account = (await response.json()) as AccountDetail;
    expect(account).toMatchObject({
      memberId: b.memberId,
      status: "suspended",
      statusReason: "report",
      firstName: "Person1",
      phone: b.phone,
      activeSessions: 0,
      reportsAbout: { open: 1, upheld: 0, dismissed: 0 },
    });
    expect(account.reports).toMatchObject([{ reportId: id, role: "subject", status: "open" }]);
    expect(account.plans).toMatchObject([{ state: "withdrawn", reason: "suspended" }]);
    expect((await s.call("GET", "/api/accounts/nobody")).status).toBe(404);
  });
});

describe("admin ban list", () => {
  test("lifting removes the row, writes an action row with no number and no hash, and lets the number sign up", async () => {
    const s = await rig();
    const b = s.members[1] as Session;
    await s.call("POST", `/api/accounts/${b.memberId}/ban`);
    expect((await s.t.call("POST", "/auth/otp", { body: { phone: b.phone, purpose: "sign_in" } })).status).toBe(403);
    const response = await s.call("POST", "/api/bans/lift", { phone: b.phone });
    expect(response.status).toBe(200);
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 0 });
    const rows = actions(s.t, "ban_lift");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(b.phone);
    expect(JSON.stringify(rows)).not.toMatch(/[0-9a-f]{64}/);
    const tokens = await s.t.signIn(b.phone);
    expect(tokens.accessToken.length).toBeGreaterThan(20);
    // A second lift finds nothing and writes nothing.
    expect((await s.call("POST", "/api/bans/lift", { phone: b.phone })).status).toBe(404);
    expect(actions(s.t, "ban_lift")).toHaveLength(1);
  });

  test("a number the service cannot hold, an unknown field and a missing phone are 400", async () => {
    const s = await rig();
    for (const body of [{ phone: "12345" }, { phone: "+1 202 555 0100", extra: true }, {}]) {
      expect((await s.call("POST", "/api/bans/lift", body)).status).toBe(400);
    }
  });

  test("an Indian number written with spaces is read the same as +91 and ten digits", async () => {
    const s = await rig();
    // Built from parts so this file holds no real-looking number.
    const ten = ["98765", "43210"];
    writeBan(s.t.db, s.t.app.config.banPepper, `+91${ten.join("")}`, "operator", s.t.clock());
    expect((await s.call("POST", "/api/bans/lift", { phone: ten.join(" ") })).status).toBe(200);
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 0 });
  });

  test("a pepper that is not the app's is 503 on every route that hashes a number, and nothing changes", async () => {
    const s = await rig({ pepper: "a-different-pepper-0123456789abcdef" });
    const [a, b] = s.members as [Session, Session];
    const report = await fileReport(s, a, b);
    for (const [method, path, body] of [
      ["POST", `/api/accounts/${b.memberId}/ban`, undefined],
      ["POST", "/api/bans/lift", { phone: b.phone }],
      ["POST", `/api/accounts/${b.memberId}/reinstate`, undefined],
      ["POST", `/api/reports/${report}/close`, { outcome: "dismissed", note: "ok" }],
    ] as const) {
      const response = await s.call(method, path, body);
      expect([path, response.status]).toEqual([path, 503]);
    }
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");
    expect(s.t.db.query("SELECT status FROM report WHERE id = ?").get(report)).toEqual({ status: "open" });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get()).toEqual({ n: 0 });
  });

  test("without the pepper lifting is 503", async () => {
    const s = await rig({ pepper: null });
    expect((await s.call("POST", "/api/bans/lift", { phone: "+12025550100" })).status).toBe(503);
  });
});

describe("admin failed notices", () => {
  test("lists notices that were stale, had no device, were not sent or had a refused delivery, and nothing else", async () => {
    const s = await rig();
    const [a, b, c, d] = s.members as [Session, Session, Session, Session];
    const now = s.t.clock();
    const make = (who: Session, key: string, state: string) => {
      const id = addNotice(s.t.db, {
        memberId: who.memberId,
        kind: "group_smaller",
        planId: null,
        groupId: s.groupId,
        dedupeKey: key,
        now,
      }) as string;
      s.t.db.query("UPDATE notice SET push_state = ? WHERE id = ?").run(state, id);
      return id;
    };
    const stale = make(a, "k-stale", "stale");
    const noDevice = make(b, "k-nodevice", "no_device");
    const notSent = make(c, "k-notsent", "not_sent");
    const sentButRefused = make(d, "k-refused", "sent");
    make(a, "k-sent", "sent");
    make(b, "k-pending", "pending");
    const device = s.t.db.query("SELECT id FROM device WHERE member_id = ?").get(d.memberId) as { id: string } | null;
    const deviceId = device?.id ?? "device-d";
    if (device === null) {
      s.t.db
        .query("INSERT INTO device (id, member_id, expo_token, platform, created_at, last_seen_at) VALUES (?, ?, ?, 'android', ?, ?)")
        .run(deviceId, d.memberId, "ExponentPushToken[fake-d]", now.toISOString(), now.toISOString());
    }
    s.t.db
      .query(
        "INSERT INTO push_delivery (id, notice_id, device_id, status, error_code, created_at) VALUES (?, ?, ?, 'failed', 'MessageRateExceeded', ?)",
      )
      .run("delivery-1", sentButRefused, deviceId, now.toISOString());

    const response = await s.call("GET", "/api/notices?status=failed");
    expect(response.status).toBe(200);
    const { notices } = (await response.json()) as {
      notices: { noticeId: string; pushState: string; failedDeliveries: number; errorCodes: string[] }[];
    };
    expect(notices.map((n) => n.noticeId).sort()).toEqual([stale, noDevice, notSent, sentButRefused].sort());
    expect(notices.find((n) => n.noticeId === sentButRefused)).toMatchObject({
      pushState: "sent",
      failedDeliveries: 1,
      errorCodes: ["MessageRateExceeded"],
    });
    expect(notices.find((n) => n.noticeId === stale)).toMatchObject({ pushState: "stale", failedDeliveries: 0, errorCodes: [] });
    // No notice text or member name, only the kind and ids.
    expect(JSON.stringify(notices)).not.toContain("Person");
    expect((await s.call("GET", "/api/notices?status=sent")).status).toBe(400);
  });
});

describe("admin routes need the token", () => {
  test("every M4 route is 401 without the bearer token and changes nothing", async () => {
    const s = await rig();
    const [a, b] = s.members as [Session, Session];
    const id = await fileReport(s, a, b);
    const before = JSON.stringify(s.t.db.query("SELECT * FROM report").all()) + JSON.stringify(s.t.db.query("SELECT * FROM member").all());
    const routes: [string, string, unknown?][] = [
      ["GET", "/api/reports"],
      ["POST", `/api/reports/${id}/contacted`],
      ["POST", `/api/reports/${id}/close`, { outcome: "dismissed", note: "x" }],
      ["GET", `/api/accounts/${b.memberId}`],
      ["POST", `/api/accounts/${b.memberId}/suspend`],
      ["POST", `/api/accounts/${b.memberId}/reinstate`],
      ["POST", `/api/accounts/${b.memberId}/ban`],
      ["POST", "/api/bans/lift", { phone: "+12025550100" }],
      ["GET", "/api/notices?status=failed"],
    ];
    for (const [method, path, body] of routes) {
      expect([method, path, (await s.call(method, path, body, { token: null })).status]).toEqual([method, path, 401]);
      expect([method, path, (await s.call(method, path, body, { token: "wrong" })).status]).toEqual([method, path, 401]);
    }
    expect(JSON.stringify(s.t.db.query("SELECT * FROM report").all()) + JSON.stringify(s.t.db.query("SELECT * FROM member").all())).toBe(
      before,
    );
  });

  test("a wrong method on an M4 path is 405", async () => {
    const s = await rig();
    expect((await s.call("GET", "/api/bans/lift")).status).toBe(405);
    expect((await s.call("DELETE", "/api/reports")).status).toBe(405);
  });
});
