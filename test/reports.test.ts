import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { createReportResponseSchema } from "@turnout/contract/app/reports";
import { purgeClosedReports } from "../src/app-api/housekeeping.js";
import { banReason, isPhoneRefused } from "../src/social/bans.js";
import { getMember } from "../src/social/members.js";
import { milestones } from "../src/social/model/schedule.js";
import { closeReport, markContacted, OperatorRuleError } from "../src/social/operator.js";
import { tick } from "../src/social/tick.js";
import { type TestApp, testApp } from "./appHelpers.js";
import { memberSession, type Session } from "./helpers/appFixture.js";
import { type Setup, setup } from "./helpers/groupFixture.js";
import { pastGroup } from "./helpers/pastGroup.js";
import { SHOW_START, seedShow, waitingPlan } from "./helpers/socialFixture.js";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const START = Date.parse(SHOW_START);
const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;

// setup() makes Person0 a woman, Person1 a man, Person2 a woman and Person3 a man.
const OPEN = -3 * HOUR;

let clientCounter = 0;
const nextClient = () => `client-${String(++clientCounter).padStart(6, "0")}`;
const refOf = (s: Setup, who: Session): string =>
  (
    s.t.db.query("SELECT member_ref AS ref FROM group_member WHERE group_id = ? AND member_id = ?").get(s.groupId, who.memberId) as {
      ref: string;
    }
  ).ref;
const report = (s: Setup, by: Session, about: Session, extra: Record<string, unknown> = {}) =>
  s.t.call("POST", "/reports", {
    token: by.token,
    body: { groupId: s.groupId, memberRef: refOf(s, about), body: "They made me uncomfortable.", clientId: nextClient(), ...extra },
  });
const reportRows = (t: TestApp) => t.db.query("SELECT * FROM report ORDER BY id").all() as Record<string, unknown>[];
const actions = (t: TestApp, action: string) =>
  t.db.query("SELECT * FROM operator_action WHERE action = ?").all(action) as Record<string, unknown>[];
const pepper = (t: TestApp) => t.app.config.banPepper;

describe("POST /reports", () => {
  test("one report suspends, signs out, withdraws plans and removes the person from the group in one step", async () => {
    const s = await setup();
    const [a, b, c, d] = s.members as [Session, Session, Session, Session];
    seedShow(s.t.db, { id: "show-b", startsAt: "2026-11-20T14:00:00Z" });
    waitingPlan(s.t.db, b.memberId, "show-b", s.t.clock());
    await s.at(OPEN);
    const response = await report(s, a, b);
    expect(response.status).toBe(201);
    const { reportId } = createReportResponseSchema.parse(await response.json());

    const row = reportRows(s.t)[0] as Record<string, string | null>;
    expect(row).toMatchObject({
      id: reportId,
      group_id: s.groupId,
      reporter_id: a.memberId,
      subject_id: b.memberId,
      message_id: null,
      reporter_gender: "woman",
      subject_gender: "man",
      subject_status_before: "active",
      status: "open",
      outcome: null,
      created_at: s.t.clock().toISOString(),
      due_at: new Date(s.t.clock().getTime() + 24 * HOUR).toISOString(),
      contacted_reporter_at: null,
    });
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "suspended", status_reason: "report" });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM auth_session WHERE member_id = ? AND revoked_at IS NULL").get(b.memberId)).toEqual({
      n: 0,
    });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM device WHERE member_id = ?").get(b.memberId)).toEqual({ n: 0 });
    const states = s.t.db.query("SELECT state FROM plan WHERE member_id = ?").all(b.memberId) as { state: string }[];
    expect(states.map((p) => p.state)).toEqual(["withdrawn", "withdrawn"]);
    expect(s.t.db.query("SELECT left_at FROM group_member WHERE member_id = ?").get(b.memberId)).not.toEqual({ left_at: null });
    // Everyone else is still in, and the group was told someone left, not who.
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND left_at IS NULL").get(s.groupId)).toEqual({ n: 3 });
    for (const who of [a, c, d]) {
      const kinds = s.t.db.query("SELECT kind FROM notice WHERE member_id = ? AND group_id = ?").all(who.memberId, s.groupId) as {
        kind: string;
      }[];
      expect(kinds.map((k) => k.kind)).toContain("group_smaller");
    }
  });

  test("the subject's next call is 403, and signing in again is refused", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    expect((await report(s, a, b)).status).toBe(201);
    for (const path of ["/me", "/plans", `/groups/${s.groupId}/messages`]) {
      const response = await s.t.call("GET", path, { token: b.token });
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("account_suspended");
    }
    const requested = await s.t.call("POST", "/auth/otp", { body: { phone: b.phone, purpose: "sign_in" } });
    const { challengeId } = (await requested.json()) as { challengeId: string };
    const verified = await s.t.call("POST", "/auth/otp/verify", {
      body: { challengeId, phone: b.phone, code: s.t.sender.lastCode(b.phone), noticeVersion: "2026-10-26" },
    });
    expect(verified.status).toBe(403);
    expect((await errorOf(verified)).code).toBe("account_suspended");
  });

  test("the reporter and the others are untouched, and nobody but the operator hears of it", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    await report(s, a, b);
    expect(getMember(s.t.db, a.memberId)?.status).toBe("active");
    expect((await s.t.call("GET", "/me", { token: a.token })).status).toBe(200);
    const kinds = s.t.db.query("SELECT kind FROM notice WHERE member_id IN (?, ?)").all(a.memberId, c.memberId) as { kind: string }[];
    expect(kinds.map((k) => k.kind).filter((k) => k.includes("report"))).toEqual([]);
  });

  test("the operator is alerted with the report id and no name, number or text", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, a, b, { body: "A private account of it." })).json());
    expect(s.t.alerts.sent).toHaveLength(1);
    const sent = s.t.alerts.sent[0] as { kind: string; text: string };
    expect(sent.kind).toBe(`report_new:${reportId}`);
    expect(sent.text).toContain(reportId);
    for (const secret of ["Person0", "Person1", a.phone, b.phone, "private account", a.memberId, b.memberId]) {
      expect(sent.text + sent.kind).not.toContain(secret);
    }
    expect(s.t.db.query("SELECT alert_key FROM alert_sent WHERE alert_key = ?").get(`report_new:${reportId}`)).not.toBeNull();
    // Marked sent, so the ticker does not send it again.
    expect(tick(s.t.db, s.t.clock()).alerts.filter((x) => x.key.startsWith("report_new"))).toEqual([]);
  });

  test("a retry of the same clientId answers with the stored report, writes nothing and costs no rate limit", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    const clientId = nextClient();
    const first = await report(s, a, b, { clientId });
    expect(first.status).toBe(201);
    const { reportId } = createReportResponseSchema.parse(await first.json());
    for (let i = 0; i < 8; i++) {
      const again = await report(s, a, b, { clientId });
      expect(again.status).toBe(200);
      expect(createReportResponseSchema.parse(await again.json()).reportId).toBe(reportId);
    }
    expect(reportRows(s.t)).toHaveLength(1);
    expect(s.t.alerts.sent).toHaveLength(1);
    const elsewhere = await s.t.call("POST", "/reports", {
      token: a.token,
      body: { groupId: "another-group", memberRef: refOf(s, b), body: "Again.", clientId },
    });
    expect(elsewhere.status).toBe(400);
  });

  test("it is limited to five a day, and the sixth is a 429 that stores nothing", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    for (let i = 0; i < 5; i++) expect((await report(s, a, b)).status).toBe(201);
    const sixth = await report(s, a, b);
    expect(sixth.status).toBe(429);
    expect((await errorOf(sixth)).code).toBe("rate_limited");
    expect(reportRows(s.t)).toHaveLength(5);
  });

  test("a second member can report someone who is already suspended, and a dismissal waits for both", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    await report(s, a, b);
    const second = await report(s, c, b);
    expect(second.status).toBe(201);
    const rows = reportRows(s.t) as { subject_status_before: string; status: string }[];
    expect(rows.map((r) => r.subject_status_before)).toEqual(["active", "active"]);
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");
  });

  test("a report about a message needs that message to be the person's own, in that group", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    const posted = async (who: Session) =>
      (
        (await (
          await s.t.call("POST", `/groups/${s.groupId}/messages`, {
            token: who.token,
            body: { body: "hello there", clientId: nextClient() },
          })
        ).json()) as {
          id: string;
        }
      ).id;
    const bMessage = await posted(b);
    const cMessage = await posted(c);
    for (const messageId of [cMessage, "no-such-message"]) {
      const response = await report(s, a, b, { messageId });
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("invalid_request");
    }
    expect(reportRows(s.t)).toHaveLength(0);
    expect((await report(s, a, b, { messageId: bMessage })).status).toBe(201);
    expect((reportRows(s.t)[0] as { message_id: string }).message_id).toBe(bMessage);
  });

  test("the request is strict and the text is 1 to 2,000 characters after trimming", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    for (const extra of [{ lat: 1, lng: 2 }, { body: "   " }, { body: "x".repeat(2001) }, { clientId: "short" }, { memberRef: "" }]) {
      expect((await report(s, a, b, extra)).status).toBe(400);
    }
    expect((await report(s, a, b, { body: `  ${"é".repeat(2000)}  ` })).status).toBe(201);
    expect(reportRows(s.t)).toHaveLength(1);
    expect(((reportRows(s.t)[0] as { body: string }).body.match(/é/g) ?? []).length).toBe(2000);
  });

  test("an outsider, yourself, a ref that is not in the group and a group that does not exist are the same 404", async () => {
    const s = await setup(5);
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    const stranger = await s.t.signIn((await import("./appHelpers.js")).PHONES[15] as string);
    const strangerSession = { token: stranger.accessToken } as Session;
    const results = [
      await report(s, strangerSession, b),
      await report(s, a, a),
      await report(s, a, b, { memberRef: "no-such-ref" }),
      await report(s, a, b, { groupId: "no-such-group" }),
    ];
    for (const response of results) {
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("not_found");
    }
    expect(reportRows(s.t)).toHaveLength(0);
    expect(getMember(s.t.db, b.memberId)?.status).toBe("active");
  });

  test("it opens at T-3h and not a minute before, and ends at the show plus 30 days", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN - MINUTE);
    const early = await report(s, a, b);
    expect(early.status).toBe(404);
    expect((await errorOf(early)).code).toBe("not_found");
    await s.at(OPEN);
    expect((await report(s, a, b)).status).toBe(201);

    const late = await setup();
    const [c, d] = late.members as [Session, Session];
    const gone = Date.parse(milestones(SHOW_START).messagesGoneAt) - START;
    await late.at(gone - MINUTE);
    expect((await report(late, c, d)).status).toBe(201);
    const after = await setup();
    const [e, f] = after.members as [Session, Session];
    await after.at(gone);
    expect((await report(after, e, f)).status).toBe(404);
    expect(reportRows(after.t)).toHaveLength(0);
  });

  test("someone who left the group cannot report from it", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    s.t.db.query("UPDATE group_member SET left_at = ? WHERE member_id = ?").run(s.t.clock().toISOString(), a.memberId);
    expect((await report(s, a, b)).status).toBe(404);
  });

  test("a report on a done group removes the person from it with no notice to anyone", async () => {
    const t = await testApp();
    seedShow(t.db, { id: "show-a" });
    const a = await memberSession(t, 0, { name: "Aa", gender: "woman" });
    const b = await memberSession(t, 1, { name: "Bb", gender: "man" });
    const c = await memberSession(t, 2, { name: "Cc", gender: "woman" });
    const past = pastGroup(t.db, { startsAt: "2026-10-20T14:00:00Z", memberIds: [a.memberId, b.memberId, c.memberId] });
    waitingPlan(t.db, b.memberId, "show-a", t.clock());
    const noticesBefore = (t.db.query("SELECT COUNT(*) AS n FROM notice").get() as { n: number }).n;
    const response = await t.call("POST", "/reports", {
      token: a.token,
      body: { groupId: past.groupId, memberRef: past.refs.get(b.memberId), body: "After the show.", clientId: nextClient() },
    });
    expect(response.status).toBe(201);
    expect(getMember(t.db, b.memberId)?.status).toBe("suspended");
    expect(t.db.query("SELECT left_at FROM group_member WHERE member_id = ? AND group_id = ?").get(b.memberId, past.groupId)).not.toEqual({
      left_at: null,
    });
    expect(t.db.query("SELECT COUNT(*) AS n FROM group_member WHERE group_id = ? AND left_at IS NULL").get(past.groupId)).toEqual({ n: 2 });
    expect(t.db.query("SELECT state FROM plan WHERE member_id = ? AND event_id = 'show-a'").get(b.memberId)).toEqual({
      state: "withdrawn",
    });
    expect((t.db.query("SELECT COUNT(*) AS n FROM notice").get() as { n: number }).n).toBe(noticesBefore);
  });

  test("a suspended member cannot report, and the reporter's own account is not touched by a report about them", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    await report(s, a, b);
    expect((await report(s, b, a)).status).toBe(403);
  });
});

describe("the operator's alerts for a report", () => {
  test("a lost send goes out again from the ticker; at due minus 4 hours and then every hour once overdue", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    s.t.app.alerts = {
      async notify() {
        throw new Error("webhook down");
      },
    };
    await s.at(OPEN);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, a, b)).json());
    const due = s.t.clock().getTime() + 24 * HOUR;
    const keys = (at: number) => {
      s.t.clock.set(new Date(at));
      return tick(s.t.db, s.t.clock())
        .alerts.map((x) => x.key)
        .filter((k) => k.includes(reportId));
    };
    const mark = (key: string) => s.t.db.query("INSERT OR IGNORE INTO alert_sent (alert_key, sent_at) VALUES (?, ?)").run(key, "x");
    expect(keys(due - 10 * HOUR)).toEqual([`report_new:${reportId}`]);
    mark(`report_new:${reportId}`);
    expect(keys(due - 4 * HOUR - MINUTE)).toEqual([]);
    expect(keys(due - 4 * HOUR)).toEqual([`report_due_soon:${reportId}`]);
    mark(`report_due_soon:${reportId}`);
    expect(keys(due - MINUTE)).toEqual([]);
    expect(keys(due)).toEqual([`report_overdue:${reportId}:0`]);
    mark(`report_overdue:${reportId}:0`);
    expect(keys(due + 59 * MINUTE)).toEqual([]);
    expect(keys(due + HOUR)).toEqual([`report_overdue:${reportId}:1`]);
    // A pass that was late sends the hour it is in, not every hour it missed.
    expect(keys(due + 5 * HOUR + 2 * MINUTE)).toEqual([`report_overdue:${reportId}:5`]);
    // Closing it ends them all.
    markContacted(s.t.db, reportId, s.t.clock());
    closeReport(s.t.db, pepper(s.t), reportId, "dismissed", null, s.t.clock(), s.t.app.config.tunables);
    expect(keys(due + 9 * HOUR)).toEqual([]);
  });
});

describe("closeReport and markContacted", () => {
  test("a report by a woman about a man cannot be closed until the reporter has been contacted", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, a, b)).json());
    for (const outcome of ["upheld", "dismissed"] as const) {
      expect(() => closeReport(s.t.db, pepper(s.t), reportId, outcome, "n", s.t.clock())).toThrow(OperatorRuleError);
    }
    // Nothing was written by the refusals.
    expect(reportRows(s.t)[0]).toMatchObject({ status: "open", outcome: null, close_note: null });
    expect(actions(s.t, "report_close")).toHaveLength(0);
    expect(getMember(s.t.db, b.memberId)?.status).toBe("suspended");

    expect(markContacted(s.t.db, reportId, s.t.clock())).toEqual({ ok: true });
    expect(markContacted(s.t.db, reportId, s.t.clock())).toEqual({ ok: true });
    expect(actions(s.t, "report_contacted")).toHaveLength(1);
    expect(reportRows(s.t)[0]).toMatchObject({ contacted_reporter_at: s.t.clock().toISOString() });
    expect(closeReport(s.t.db, pepper(s.t), reportId, "dismissed", "no case", s.t.clock())).toEqual({ ok: true, fileKeys: [] });
  });

  test("every other pairing closes without the contact", async () => {
    const s = await setup(6);
    const [a, b, c, d, e, f] = s.members as [Session, Session, Session, Session, Session, Session];
    await s.at(OPEN);
    // woman about woman, man about woman, man about non-binary.
    const pairs: [Session, Session][] = [
      [c, a],
      [b, f],
      [d, e],
    ];
    for (const [by, about] of pairs) {
      const { reportId } = createReportResponseSchema.parse(await (await report(s, by, about)).json());
      expect(closeReport(s.t.db, pepper(s.t), reportId, "dismissed", null, s.t.clock())).toMatchObject({ ok: true });
    }
  });

  test("a close is refused for a report that does not exist and for one already closed", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    expect(closeReport(s.t.db, pepper(s.t), "nope", "dismissed", null, s.t.clock())).toEqual({ ok: false, error: "not_found" });
    expect(markContacted(s.t.db, "nope", s.t.clock())).toEqual({ ok: false, error: "not_found" });
    const { reportId } = createReportResponseSchema.parse(await (await report(s, c, a)).json());
    expect(b).toBeDefined();
    closeReport(s.t.db, pepper(s.t), reportId, "dismissed", null, s.t.clock());
    expect(closeReport(s.t.db, pepper(s.t), reportId, "upheld", null, s.t.clock())).toEqual({ ok: false, error: "already_closed" });
    expect(markContacted(s.t.db, reportId, s.t.clock())).toEqual({ ok: false, error: "already_closed" });
    expect(actions(s.t, "report_close")).toHaveLength(1);
  });

  test("upheld puts the number on the ban list, erases the account and refuses the number after", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    s.t.db.query("UPDATE profile SET photo_key = ? WHERE member_id = ?").run("photos/reported.jpg", b.memberId);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, a, b)).json());
    markContacted(s.t.db, reportId, s.t.clock());
    const before = (s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get() as { n: number }).n;
    const result = closeReport(s.t.db, pepper(s.t), reportId, "upheld", "confirmed", s.t.clock());
    expect(result).toEqual({ ok: true, fileKeys: expect.arrayContaining(["photos/reported.jpg"]) as string[] });
    expect((s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get() as { n: number }).n).toBe(before + 1);
    expect(banReason(s.t.db, pepper(s.t), b.phone)).toBe("report_upheld");
    expect(isPhoneRefused(s.t.db, pepper(s.t), b.phone)).toBe(true);
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "deleted", phone_e164: null });
    expect(s.t.db.query("SELECT COUNT(*) AS n FROM profile WHERE member_id = ?").get(b.memberId)).toEqual({ n: 0 });
    expect(reportRows(s.t)[0]).toMatchObject({ status: "closed", outcome: "upheld", close_note: "confirmed", subject_id: b.memberId });
    const refused = await s.t.call("POST", "/auth/otp", { body: { phone: b.phone, purpose: "sign_in" } });
    expect(refused.status).toBe(403);
    expect((await errorOf(refused)).code).toBe("sign_in_unavailable");
  });

  test("the action rows hold the outcome code and never the note", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, c, a, { body: "private words" })).json());
    closeReport(s.t.db, pepper(s.t), reportId, "dismissed", "a private note", s.t.clock());
    expect(b).toBeDefined();
    const rows = actions(s.t, "report_close");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subject_type: "report", subject_id: reportId, detail: JSON.stringify({ outcome: "dismissed" }) });
    expect(JSON.stringify(rows)).not.toContain("private");
  });

  test("dismissed puts the account back once no other report is open; withdrawn plans stay withdrawn", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    const first = createReportResponseSchema.parse(await (await report(s, a, b)).json()).reportId;
    const second = createReportResponseSchema.parse(await (await report(s, c, b)).json()).reportId;
    markContacted(s.t.db, first, s.t.clock());
    markContacted(s.t.db, second, s.t.clock());
    closeReport(s.t.db, pepper(s.t), first, "dismissed", null, s.t.clock());
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "suspended", status_reason: "report" });
    closeReport(s.t.db, pepper(s.t), second, "dismissed", null, s.t.clock());
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "active", status_reason: null });
    expect(s.t.db.query("SELECT state FROM plan WHERE member_id = ?").get(b.memberId)).toEqual({ state: "withdrawn" });
    const again = await s.t.signIn(b.phone);
    expect((await s.t.call("GET", "/me", { token: again.accessToken })).status).toBe(200);
  });

  test("dismissed puts a stopped member back as stopped", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    s.t.db.query("UPDATE member SET status = 'stopped', status_reason = 'downvote_stop' WHERE id = ?").run(b.memberId);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, a, b)).json());
    expect((reportRows(s.t)[0] as { subject_status_before: string }).subject_status_before).toBe("stopped");
    markContacted(s.t.db, reportId, s.t.clock());
    closeReport(s.t.db, pepper(s.t), reportId, "dismissed", null, s.t.clock());
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "stopped", status_reason: "downvote_stop" });
  });

  test("a dismissal leaves an operator's suspension in place", async () => {
    const s = await setup();
    const [a, b] = s.members as [Session, Session];
    await s.at(OPEN);
    s.t.db.query("UPDATE member SET status = 'suspended', status_reason = 'operator' WHERE id = ?").run(b.memberId);
    const { reportId } = createReportResponseSchema.parse(await (await report(s, a, b)).json());
    expect((reportRows(s.t)[0] as { subject_status_before: string }).subject_status_before).toBe("suspended");
    markContacted(s.t.db, reportId, s.t.clock());
    closeReport(s.t.db, pepper(s.t), reportId, "dismissed", null, s.t.clock());
    expect(getMember(s.t.db, b.memberId)).toMatchObject({ status: "suspended", status_reason: "operator" });
  });

  test("an upheld report on someone who has since deleted their account bans nothing and does not fail", async () => {
    const s = await setup();
    const [a, b, c] = s.members as [Session, Session, Session];
    await s.at(OPEN);
    const first = createReportResponseSchema.parse(await (await report(s, a, b)).json()).reportId;
    const second = createReportResponseSchema.parse(await (await report(s, c, b)).json()).reportId;
    markContacted(s.t.db, first, s.t.clock());
    markContacted(s.t.db, second, s.t.clock());
    expect(closeReport(s.t.db, pepper(s.t), first, "upheld", null, s.t.clock())).toMatchObject({ ok: true });
    const bans = (s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get() as { n: number }).n;
    expect(closeReport(s.t.db, pepper(s.t), second, "upheld", null, s.t.clock())).toEqual({ ok: true, fileKeys: [] });
    expect((s.t.db.query("SELECT COUNT(*) AS n FROM ban_list").get() as { n: number }).n).toBe(bans);
  });
});

describe("closed reports are kept a year", () => {
  test("a closed report is deleted a year after it closed, and an open one never is", async () => {
    const s = await setup(6);
    const [a, b, c, d, e, f] = s.members as [Session, Session, Session, Session, Session, Session];
    await s.at(OPEN);
    const old = createReportResponseSchema.parse(await (await report(s, c, a)).json()).reportId;
    const recent = createReportResponseSchema.parse(await (await report(s, b, f)).json()).reportId;
    const open = createReportResponseSchema.parse(await (await report(s, d, e)).json()).reportId;
    s.t.db
      .query("UPDATE report SET status = 'closed', outcome = 'dismissed', closed_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", old);
    s.t.db
      .query("UPDATE report SET status = 'closed', outcome = 'dismissed', closed_at = ? WHERE id = ?")
      .run("2026-01-02T00:00:00.000Z", recent);
    const days = s.t.app.config.tunables.report.retentionDays;
    expect(days).toBe(365);
    // The first is exactly a year and a day old, the second a year to the day.
    const now = new Date("2027-01-02T00:00:00.000Z");
    expect(purgeClosedReports(s.t.db, now, days)).toBe(1);
    const left = (reportRows(s.t) as { id: string }[]).map((r) => r.id).sort();
    expect(left).toEqual([recent, open].sort());
    expect(purgeClosedReports(s.t.db, new Date("2027-01-03T00:00:01.000Z"), days)).toBe(1);
    expect((reportRows(s.t) as { id: string }[]).map((r) => r.id)).toEqual([open]);
  });
});
