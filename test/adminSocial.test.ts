import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { AdminFiles } from "../src/admin/files.js";
import { adminFilesFromEnv, signAdminLink, verifyAdminLink } from "../src/admin/files.js";
import type { AdminContext } from "../src/admin/server.js";
import { apiResponse } from "../src/admin/server.js";
import { signFileLink, verifyFileLink } from "../src/app-api/fileLinks.js";
import { runGroupingPass } from "../src/social/groups.js";
import { createPlan, type PlanRow } from "../src/social/plans.js";
import { addTicket } from "../src/social/tickets.js";
import { memoryStore } from "../src/utils/objectStore.js";
import { SHOW_START, seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-10-27T06:00:00.000Z");
const TOKEN = "admin-token-for-tests";
const SECRET = "link-secret-for-tests-0123456789abcdef";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const PDF = new TextEncoder().encode("%PDF-1.4 test");

interface Rig {
  db: Database;
  ctx: AdminContext;
  files: AdminFiles;
  setNow(at: string): void;
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  /** The same call with the bearer token. */
  authed(method: string, path: string, body?: unknown): Promise<Response>;
}

function rig(withFiles = true): Rig {
  const db = memoryDb();
  let now = NOW;
  const files: AdminFiles = {
    store: memoryStore({ now: () => now, link: (key) => key }),
    secret: SECRET,
    ttlSeconds: 300,
  };
  const ctx: AdminContext = {
    read: db,
    write: db,
    agentRunsDir: "/nonexistent",
    token: TOKEN,
    files: withFiles ? files : null,
    now: () => now,
    startRun: () => ({ runId: "r", logPath: "x" }),
  };
  const call: Rig["call"] = (method, path, body, headers = {}) =>
    apiResponse(
      ctx,
      new Request(`http://127.0.0.1:3001${path}`, {
        method,
        headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return {
    db,
    ctx,
    files,
    setNow: (at) => {
      now = new Date(at);
    },
    call,
    authed: (method, path, body) => call(method, path, body, { authorization: `Bearer ${TOKEN}` }),
  };
}

/** A plan with a pending ticket, the file in the store. */
async function ticketed(r: Rig, show: string, options: { sha?: string; mime?: string; bytes?: Uint8Array; name?: string } = {}) {
  const memberId = seedMember(r.db, NOW, { name: options.name });
  const made = createPlan(r.db, { memberId, eventId: show, groupType: "open", now: NOW });
  if (!made.ok) throw new Error(made.error);
  const extension = options.mime === "application/pdf" ? "pdf" : "jpg";
  const key = `tickets/${made.plan.id}/a.${extension}`;
  await r.files.store.put(key, options.bytes ?? JPEG, options.mime ?? "image/jpeg");
  const sent = addTicket(r.db, {
    plan: made.plan,
    objectKey: key,
    mime: options.mime ?? "image/jpeg",
    bytes: 1000,
    sha256: options.sha ?? `sha-${made.plan.id}`,
    now: NOW,
  });
  if (!sent.ok) throw new Error(sent.error);
  clearActions(r.db);
  return { memberId, plan: made.plan as PlanRow, ticketId: sent.ticket.id, key };
}

const actions = (db: Database) =>
  db.query("SELECT action, subject_type AS subjectType, subject_id AS subjectId, detail FROM operator_action ORDER BY id").all() as {
    action: string;
    subjectType: string;
    subjectId: string;
    detail: string | null;
  }[];

/** The fixtures approve handles and tickets through the operator code, so a test clears those rows before it acts. */
const clearActions = (db: Database) => db.query("DELETE FROM operator_action").run();

const planState = (db: Database, id: string) => (db.query("SELECT state FROM plan WHERE id = ?").get(id) as { state: string }).state;

describe("admin links", () => {
  test("a link works for its own path before it expires, and for nothing else", () => {
    const { files } = rig();
    const link = signAdminLink(files, "/api/tickets/t1/file", NOW);
    const [path = "", query = ""] = link.split("?");
    const params = new URLSearchParams(query);
    expect(verifyAdminLink(files, path, params, NOW)).toBe(true);
    expect(verifyAdminLink(files, "/api/tickets/t2/file", params, NOW)).toBe(false);
    expect(verifyAdminLink(files, path, params, new Date(NOW.getTime() + 301_000))).toBe(false);
    params.set("sig", `${params.get("sig")}x`);
    expect(verifyAdminLink(files, path, params, NOW)).toBe(false);
    expect(verifyAdminLink({ ...files, secret: "another-secret-0123456789abcdef0123" }, path, new URLSearchParams(query), NOW)).toBe(false);
  });

  test("a signature made for an app file link is no admin link, even over the same text", () => {
    const { files } = rig();
    const path = "/api/tickets/t1/file";
    const app = new URL(`http://x${signFileLink(SECRET, path, NOW, 300)}`);
    expect(verifyAdminLink(files, path, app.searchParams, NOW)).toBe(false);
    const admin = new URL(`http://x${signAdminLink(files, path, NOW)}`);
    expect(verifyFileLink(SECRET, path, admin.searchParams.get("exp"), admin.searchParams.get("sig"), NOW)).toBe(false);
  });

  test("the store comes from the same settings as the app API, and is off without the secret", () => {
    expect(adminFilesFromEnv({})).toBeNull();
    expect(adminFilesFromEnv({ FILE_LINK_SECRET: SECRET, OBJECT_STORE: "memory" })).toBeNull();
    expect(adminFilesFromEnv({ FILE_LINK_SECRET: SECRET, OBJECT_STORE: "s3", S3_BUCKET: "b" })).toBeNull();
    expect(adminFilesFromEnv({ FILE_LINK_SECRET: SECRET })?.ttlSeconds).toBe(300);
    expect(
      adminFilesFromEnv({ FILE_LINK_SECRET: SECRET, OBJECT_STORE: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" }),
    ).not.toBeNull();
  });
});

describe("the new routes need the token", () => {
  test("every one answers 401 without it", async () => {
    const r = rig();
    const routes: [string, string][] = [
      ["GET", "/api/tickets"],
      ["POST", "/api/tickets/x/approve"],
      ["POST", "/api/tickets/x/reject"],
      ["GET", "/api/shows"],
      ["PUT", "/api/events/x/start-time"],
      ["PUT", "/api/groups/x/cafe"],
      ["GET", "/api/handles"],
      ["POST", "/api/handles/x/approve"],
      ["POST", "/api/handles/x/reject"],
      ["GET", "/api/tickets/x/file"],
      ["GET", "/api/handles/x/photo"],
    ];
    for (const [method, path] of routes) expect((await r.call(method, path)).status).toBe(401);
  });
});

describe("ticket queue", () => {
  test("lists what is waiting with the time left, a file link and a duplicate count, and no member detail", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x", title: "Standup Night" });
    const first = await ticketed(r, show, { sha: "same", name: "Asha" });
    await ticketed(r, show, { sha: "same", name: "Ravi" });
    await ticketed(r, show, { name: "Meera" });
    const res = await r.authed("GET", "/api/tickets");
    expect(res.status).toBe(200);
    const { tickets } = (await res.json()) as {
      tickets: { ticketId: string; showTitle: string; minutesLeft: number; duplicates: number; fileUrl: string | null; lockAt: string }[];
    };
    expect(tickets).toHaveLength(3);
    const row = tickets.find((t) => t.ticketId === first.ticketId);
    expect(row?.showTitle).toBe("Standup Night");
    expect(row?.lockAt).toBe("2026-11-09T14:00:00.000Z");
    expect(row?.minutesLeft).toBe((Date.parse("2026-11-09T14:00:00.000Z") - NOW.getTime()) / 60_000);
    expect(row?.duplicates).toBe(1);
    expect(tickets.filter((t) => t.duplicates === 0)).toHaveLength(1);
    expect(row?.fileUrl).toStartWith(`/api/tickets/${first.ticketId}/file?exp=`);
    const text = JSON.stringify(tickets);
    for (const secret of ["Asha", "Ravi", "Meera", "+1202", "sha-", "a.jpg"]) expect(text).not.toContain(secret);
  });

  test("a ticket that ran out of time is not listed, and without a store there is no link", async () => {
    const r = rig(false);
    const show = seedShow(r.db, { id: "x" });
    await ticketed({ ...r, files: rig().files }, show);
    const listed = (await (await r.authed("GET", "/api/tickets")).json()) as { tickets: { fileUrl: string | null }[] };
    expect(listed.tickets[0]?.fileUrl).toBeNull();
    r.setNow("2026-11-09T14:00:00.000Z");
    expect(((await (await r.authed("GET", "/api/tickets")).json()) as { tickets: unknown[] }).tickets).toEqual([]);
  });

  test("the signed link opens the file with no token; a PDF downloads and nothing is sniffed", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const image = await ticketed(r, show);
    const pdf = await ticketed(r, show, { mime: "application/pdf", bytes: PDF });
    const link = async (ticketId: string) =>
      ((await (await r.authed("GET", "/api/tickets")).json()) as { tickets: { ticketId: string; fileUrl: string }[] }).tickets.find(
        (t) => t.ticketId === ticketId,
      )?.fileUrl as string;

    const shown = await r.call("GET", await link(image.ticketId));
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/jpeg");
    expect(shown.headers.get("content-disposition")).toBe("inline");
    expect(shown.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await shown.arrayBuffer())).toEqual(JPEG);

    const download = await r.call("GET", await link(pdf.ticketId));
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe("attachment");
    expect(download.headers.get("content-type")).toBe("application/octet-stream");
    expect(await download.text()).toBe("%PDF-1.4 test");
  });

  test("a signed link opens on a host that is not loopback, which a token-protected panel may be served from", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const a = await ticketed(r, show);
    const own = signAdminLink(r.files, `/api/tickets/${a.ticketId}/file`, NOW);
    expect((await apiResponse(r.ctx, new Request(`http://admin.example${own}`))).status).toBe(200);
    // The signature opens only that file: a plain read from the same host still needs the token.
    expect((await apiResponse(r.ctx, new Request("http://admin.example/api/tickets"))).status).toBe(401);
  });

  test("a bad, expired or borrowed signature is a 401, and a missing file a 404", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const a = await ticketed(r, show);
    const b = await ticketed(r, show);
    const own = signAdminLink(r.files, `/api/tickets/${a.ticketId}/file`, NOW);
    expect((await r.call("GET", own)).status).toBe(200);
    expect((await r.call("GET", `${own}0`)).status).toBe(401);
    expect((await r.call("GET", own.replace(a.ticketId, b.ticketId))).status).toBe(401);
    expect((await r.call("GET", `/api/tickets/${a.ticketId}/file`)).status).toBe(401);
    // a link signed for a route that is not a file route opens nothing
    const other = signAdminLink(r.files, "/api/tickets", NOW);
    expect((await r.call("GET", other)).status).toBe(401);
    r.setNow("2026-10-27T06:06:00.000Z");
    expect((await r.call("GET", own)).status).toBe(401);
    r.setNow("2026-10-27T06:00:00.000Z");
    await r.files.store.delete(a.key);
    expect((await r.authed("GET", `/api/tickets/${a.ticketId}/file`)).status).toBe(404);
    expect((await r.authed("GET", "/api/tickets/nope/file")).status).toBe(404);
  });

  test("approve moves the plan, writes the action row and tells the member; asking twice is a 409", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const t = await ticketed(r, show);
    const res = await r.authed("POST", `/api/tickets/${t.ticketId}/approve`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticketId: t.ticketId, status: "approved", planState: "finding_group" });
    expect(planState(r.db, t.plan.id)).toBe("finding_group");
    expect(actions(r.db)).toEqual([{ action: "ticket_approve", subjectType: "ticket", subjectId: t.ticketId, detail: null }]);
    expect((r.db.query("SELECT kind FROM notice WHERE member_id = ?").all(t.memberId) as { kind: string }[]).map((n) => n.kind)).toEqual([
      "ticket_approved",
    ]);
    expect((await r.authed("POST", `/api/tickets/${t.ticketId}/approve`)).status).toBe(409);
    expect((await r.authed("POST", `/api/tickets/${t.ticketId}/reject`, { reason: "unreadable" })).status).toBe(409);
    expect((await r.authed("POST", "/api/tickets/nope/approve")).status).toBe(404);
    expect(actions(r.db)).toHaveLength(1);
  });

  test("past T-24h an approval and a rejection are both 409, and nothing changes", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const t = await ticketed(r, show);
    r.setNow("2026-11-09T14:00:00.000Z");
    const approved = await r.authed("POST", `/api/tickets/${t.ticketId}/approve`);
    expect(approved.status).toBe(409);
    expect(((await approved.json()) as { error: string }).error).toContain("T-24h");
    expect((await r.authed("POST", `/api/tickets/${t.ticketId}/reject`, { reason: "unreadable" })).status).toBe(409);
    expect(planState(r.db, t.plan.id)).toBe("checking_ticket");
    expect(actions(r.db)).toEqual([]);
  });

  test("reject takes only the fixed reasons and a body with nothing else", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const t = await ticketed(r, show);
    const path = `/api/tickets/${t.ticketId}/reject`;
    expect((await r.authed("POST", path, { reason: "looks fake" })).status).toBe(400);
    expect((await r.authed("POST", path, {})).status).toBe(400);
    expect((await r.authed("POST", path, { reason: "unreadable", note: "blurry" })).status).toBe(400);
    expect((await r.call("POST", path, undefined, { authorization: `Bearer ${TOKEN}` })).status).toBe(415);
    expect(actions(r.db)).toEqual([]);
    const ok = await r.authed("POST", path, { reason: "wrong_date" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ticketId: t.ticketId, status: "rejected", planState: "ticket_rejected" });
    expect(actions(r.db)).toEqual([
      { action: "ticket_reject", subjectType: "ticket", subjectId: t.ticketId, detail: JSON.stringify({ reason: "wrong_date" }) },
    ]);
    expect((r.db.query("SELECT kind FROM notice WHERE member_id = ?").all(t.memberId) as { kind: string }[]).map((n) => n.kind)).toEqual([
      "ticket_rejected",
    ]);
  });
});

/** Four waiting members of mixed gender, so a group forms. */
function waitingFour(r: Rig, show: string, options: { pendingHandle?: boolean } = {}) {
  const genders = ["woman", "man", "woman", "man"] as const;
  const members = genders.map((gender, i) => {
    const memberId = seedMember(r.db, NOW, { gender, handle: options.pendingHandle && i === 0 ? "pending" : "approved" });
    waitingPlan(r.db, memberId, show, NOW);
    return memberId;
  });
  clearActions(r.db);
  return members;
}

describe("shows, start times and cafes", () => {
  test("upcoming shows list the pool and the groups", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    waitingFour(r, show);
    runGroupingPass(r.db, show, NOW);
    const res = await r.authed("GET", "/api/shows");
    expect(res.status).toBe(200);
    const { shows } = (await res.json()) as {
      shows: { id: string; startsAt: string; plans: Record<string, number>; groups: { state: string; size: number }[] }[];
    };
    expect(shows).toHaveLength(1);
    expect(shows[0]?.startsAt).toBe(SHOW_START);
    expect(shows[0]?.groups).toEqual([expect.objectContaining({ state: "confirmed", size: 4 })]);
    expect(JSON.stringify(shows)).not.toContain("+1202");
  });

  test("a start time moves the show, its plans and its open groups, and writes the action row", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const first = waitingFour(r, show)[0] as string;
    runGroupingPass(r.db, show, NOW);
    const res = await r.authed("PUT", `/api/events/${show}/start-time`, { startsAt: "2026-11-10T20:00:00+05:30" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: show, startsAt: "2026-11-10T14:30:00.000Z" });
    expect((r.db.query("SELECT show_starts_at AS at FROM plan WHERE member_id = ?").get(first) as { at: string }).at).toBe(
      "2026-11-10T14:30:00.000Z",
    );
    expect((r.db.query("SELECT starts_at AS at FROM show_group WHERE event_id = ?").get(show) as { at: string }).at).toBe(
      "2026-11-10T14:30:00.000Z",
    );
    expect(actions(r.db).map((a) => [a.action, a.subjectId])).toEqual([["set_start_time", show]]);
    const listed = (await (await r.authed("GET", "/api/shows")).json()) as { shows: { hasOverride: boolean; startsAt: string }[] };
    expect(listed.shows[0]).toMatchObject({ hasOverride: true, startsAt: "2026-11-10T14:30:00.000Z" });
  });

  test("a start time must be a real time with a zone, for a known show, and not already inside T-24h", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const put = (body: unknown, id = show) => r.authed("PUT", `/api/events/${id}/start-time`, body);
    for (const body of [
      {},
      { startsAt: "tomorrow" },
      { startsAt: "2026-11-10T20:00" },
      { startsAt: 5 },
      { startsAt: "2026-11-10T20:00:00Z", extra: 1 },
    ]) {
      expect((await put(body)).status).toBe(400);
    }
    expect((await put({ startsAt: "2026-11-10T20:00:00Z" }, "nope")).status).toBe(404);
    expect((await put({ startsAt: "2026-10-28T06:00:00Z" })).status).toBe(409);
    expect(actions(r.db)).toEqual([]);
  });

  test("once a group has locked the time stays", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    waitingFour(r, show);
    runGroupingPass(r.db, show, NOW);
    r.db.query("UPDATE show_group SET state = 'locked'").run();
    const res = await r.authed("PUT", `/api/events/${show}/start-time`, { startsAt: "2026-11-10T20:00:00Z" });
    expect(res.status).toBe(409);
    expect(actions(r.db)).toEqual([]);
  });

  test("a cafe names where a group meets; coordinates come as a pair", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    waitingFour(r, show);
    runGroupingPass(r.db, show, NOW);
    const group = (r.db.query("SELECT id FROM show_group").get() as { id: string }).id;
    const put = (body: unknown, id = group) => r.authed("PUT", `/api/groups/${id}/cafe`, body);
    for (const body of [{}, { name: "" }, { name: "Cafe", lat: 17.4 }, { name: "Cafe", lat: 91, lng: 78 }, { name: "Cafe", extra: true }]) {
      expect((await put(body)).status).toBe(400);
    }
    expect((await put({ name: "Cafe Beans" }, "nope")).status).toBe(404);
    const ok = await put({ name: "Cafe Beans", address: "Road 1", lat: 17.4, lng: 78.4 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ groupId: group, cafeName: "Cafe Beans" });
    expect(r.db.query("SELECT cafe_name, cafe_address, cafe_lat, cafe_lng FROM show_group WHERE id = ?").get(group)).toEqual({
      cafe_name: "Cafe Beans",
      cafe_address: "Road 1",
      cafe_lat: 17.4,
      cafe_lng: 78.4,
    });
    expect(actions(r.db).map((a) => [a.action, a.subjectType])).toEqual([["set_cafe", "group"]]);
    r.db.query("UPDATE show_group SET state = 'called_off'").run();
    expect((await put({ name: "Cafe Beans" })).status).toBe(409);
  });
});

describe("handle queue", () => {
  test("lists pending handles by the earliest lock, with a profile URL and a photo link", async () => {
    const r = rig();
    const early = seedShow(r.db, { id: "early", startsAt: "2026-11-05T14:00:00.000Z" });
    const late = seedShow(r.db, { id: "late" });
    const a = seedMember(r.db, NOW, { name: "Asha", handle: "pending" });
    const b = seedMember(r.db, NOW, { name: "Ravi", handle: "pending" });
    const c = seedMember(r.db, NOW, { name: "Meera", handle: "approved" });
    createPlan(r.db, { memberId: a, eventId: late, groupType: "open", now: NOW });
    createPlan(r.db, { memberId: b, eventId: early, groupType: "open", now: NOW });
    createPlan(r.db, { memberId: c, eventId: early, groupType: "open", now: NOW });
    r.db.query("UPDATE social_handle SET kind = 'linkedin', handle = 'ravi-k' WHERE member_id = ?").run(b);
    const res = await r.authed("GET", "/api/handles?status=pending");
    expect(res.status).toBe(200);
    const { handles } = (await res.json()) as {
      handles: { memberId: string; firstName: string; profileUrl: string; photoUrl: string | null; lockAt: string }[];
    };
    expect(handles.map((h) => h.firstName)).toEqual(["Ravi", "Asha"]);
    expect(handles[0]?.profileUrl).toBe("https://www.linkedin.com/in/ravi-k/");
    expect(handles[1]?.profileUrl).toStartWith("https://www.instagram.com/member_");
    expect(handles[0]?.lockAt).toBe("2026-11-04T14:00:00.000Z");
    expect(handles[0]?.photoUrl).toStartWith(`/api/handles/${b}/photo?exp=`);
    expect(JSON.stringify(handles)).not.toContain("photos/");
    expect((await r.authed("GET", "/api/handles?status=approved")).status).toBe(400);
  });

  test("the signed photo link opens a pending member's photo and nobody else's", async () => {
    const r = rig();
    const pending = seedMember(r.db, NOW, { handle: "pending" });
    const approved = seedMember(r.db, NOW, { handle: "approved" });
    await r.files.store.put(`photos/${pending}.jpg`, JPEG, "image/jpeg");
    await r.files.store.put(`photos/${approved}.jpg`, JPEG, "image/jpeg");
    const photo = async (id: string) => r.call("GET", signAdminLink(r.files, `/api/handles/${id}/photo`, NOW));
    const ok = await photo(pending);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(JPEG);
    expect((await photo(approved)).status).toBe(404);
    expect((await photo("nope")).status).toBe(404);
    expect((await r.call("GET", `/api/handles/${pending}/photo`)).status).toBe(401);
  });

  test("approving writes the action row and places a waiting member at once", async () => {
    const r = rig();
    const show = seedShow(r.db, { id: "x" });
    const [pending] = waitingFour(r, show, { pendingHandle: true });
    expect(runGroupingPass(r.db, show, NOW).created).toBe(0);
    expect(r.db.query("SELECT COUNT(*) AS n FROM show_group").get()).toEqual({ n: 0 });
    const res = await r.authed("POST", `/api/handles/${pending}/approve`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ memberId: pending, status: "approved" });
    expect(r.db.query("SELECT COUNT(*) AS n FROM show_group WHERE state = 'confirmed'").get()).toEqual({ n: 1 });
    expect(actions(r.db).map((a) => [a.action, a.subjectId])).toEqual([["handle_approve", pending as string]]);
    expect((await r.authed("POST", `/api/handles/${pending}/approve`)).status).toBe(409);
    expect((await r.authed("POST", "/api/handles/nope/approve")).status).toBe(404);
  });

  test("rejecting takes a fixed reason, tells the member and keeps the reason on the record", async () => {
    const r = rig();
    const member = seedMember(r.db, NOW, { handle: "pending" });
    const path = `/api/handles/${member}/reject`;
    for (const body of [{}, { reason: "ugly" }, { reason: "not_found", note: "x" }])
      expect((await r.authed("POST", path, body)).status).toBe(400);
    expect(actions(r.db)).toEqual([]);
    const ok = await r.authed("POST", path, { reason: "private_or_empty" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ memberId: member, status: "rejected", reason: "private_or_empty" });
    expect(r.db.query("SELECT status, reject_reason FROM social_handle WHERE member_id = ?").get(member)).toEqual({
      status: "rejected",
      reject_reason: "private_or_empty",
    });
    expect(actions(r.db)).toEqual([
      { action: "handle_reject", subjectType: "member", subjectId: member, detail: JSON.stringify({ reason: "private_or_empty" }) },
    ]);
    expect((r.db.query("SELECT kind FROM notice WHERE member_id = ?").all(member) as { kind: string }[]).map((n) => n.kind)).toEqual([
      "handle_rejected",
    ]);
    expect((await r.authed("POST", path, { reason: "not_found" })).status).toBe(409);
    expect((await r.authed("POST", "/api/handles/nope/reject", { reason: "not_found" })).status).toBe(404);
  });
});
