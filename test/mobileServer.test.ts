import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { type MobileServer, startMobileServer } from "../e2e/mobile-server.js";
import { SEED_MEMBERS } from "../scripts/seed-staging.js";

let server: MobileServer | undefined;
afterAll(async () => {
  await server?.stop();
});

test("the mobile server starts serve on a seeded temp database and answers /api/events", async () => {
  server = await startMobileServer();
  expect(server.url).toBe(`http://localhost:${server.port}`);
  const response = await fetch(`${server.url}/api/events?limit=100`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { events?: Array<{ title: string }> } | Array<{ title: string }>;
  const events = Array.isArray(body) ? body : (body.events ?? []);
  // The fixture seeds 13 events, all upcoming on the real clock.
  expect(events.length).toBeGreaterThan(0);
  expect(events.some((e) => e.title === "Jazz night")).toBe(true);
}, 90_000);

test("stop removes the temp database", async () => {
  const other = await startMobileServer();
  expect(fs.existsSync(other.dbPath)).toBe(true);
  await other.stop();
  expect(fs.existsSync(other.dbPath)).toBe(false);
}, 90_000);

test("it is a staging server: seeded members sign in with the code the test route reads, and the test routes need the token", async () => {
  const other = await startMobileServer();
  try {
    const api = `${other.url}/api/app/v1`;
    const phone = SEED_MEMBERS.filter((m) => m.state === "matchable").map((m) => `+1202555${m.line}`)[0] as string;
    const requested = await fetch(`${api}/auth/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, purpose: "sign_in" }),
    });
    expect(requested.status).toBe(200);
    const { challengeId } = (await requested.json()) as { challengeId: string };

    const withoutToken = await fetch(`${api}/__test/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    expect(withoutToken.status).toBe(404);
    const read = await fetch(`${api}/__test/otp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-staging-test-token": other.testToken },
      body: JSON.stringify({ phone }),
    });
    const { code } = (await read.json()) as { code: string };
    const verified = await fetch(`${api}/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId, phone, code, noticeVersion: NOTICE_VERSION }),
    });
    expect(verified.status).toBe(200);
    const { accessToken } = (await verified.json()) as { accessToken: string };
    const me = (await (await fetch(`${api}/me`, { headers: { authorization: `Bearer ${accessToken}` } })).json()) as {
      profile: { firstName: string };
      matchable: { ok: boolean };
    };
    expect(me.profile.firstName).toBe("Chitra");
    expect(me.matchable.ok).toBe(true);

    const privacy = await fetch(`${other.url}/privacy`);
    expect(privacy.status).toBe(200);
    expect(await privacy.text()).toContain("Privacy notice");
  } finally {
    await other.stop();
  }
}, 90_000);

test("serve exits 1 and names TURNOUT_ENV when it is not set, and does not start as development", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-env-"));
  try {
    const { TURNOUT_ENV: _unset, ...env } = process.env;
    const run = Bun.spawn([process.execPath, "src/cli.ts", "serve", "--db", path.join(dir, "db.sqlite"), "--port", "0", "--no-ticker"], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await run.exited).toBe(1);
    expect(await new Response(run.stderr).text()).toContain("TURNOUT_ENV is required");
    expect(await new Response(run.stdout).text()).not.toContain("Serving");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

test("the operator routes act for the operator and the other members, on the server's clock, and need the token", async () => {
  const other = await startMobileServer();
  try {
    const api = `${other.url}/api/app/v1`;
    const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const operator = async (route: string, body: unknown) => {
      const response = await post(`${other.operatorUrl}/operator/${route}`, body, { "x-staging-test-token": other.testToken });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    const phone = (line: string) => `+1202555${line}`;
    const signIn = async (number: string) => {
      const requested = await post(`${api}/auth/otp`, { phone: number, purpose: "sign_in" });
      const { challengeId } = (await requested.json()) as { challengeId: string };
      const { code } = (await (await post(`${api}/__test/otp`, { phone: number }, { "x-staging-test-token": other.testToken })).json()) as {
        code: string;
      };
      const verified = await post(`${api}/auth/otp/verify`, { challengeId, phone: number, code, noticeVersion: NOTICE_VERSION });
      return ((await verified.json()) as { accessToken: string }).accessToken;
    };
    const show = "seed-show-t2d";

    // A handle in review is turned down with a reason and then accepted, as the profile-check flow does.
    const asha = { authorization: `Bearer ${await signIn(phone("0102"))}` };
    const handle = async () =>
      ((await (await fetch(`${api}/me`, { headers: asha })).json()) as { handle: { state: string; rejectReason: string | null } }).handle;
    expect((await handle()).state).toBe("pending");
    expect((await operator("handle", { phone: phone("0102"), decision: "reject", reason: "private_or_empty" })).status).toBe(200);
    expect(await handle()).toMatchObject({ state: "rejected", rejectReason: "private_or_empty" });
    expect((await operator("handle", { phone: phone("0102"), decision: "approve" })).status).toBe(409);

    expect((await post(`${other.operatorUrl}/operator/crowd`, { eventId: show, phones: [phone("0106")] })).status).toBe(404);

    const token = await signIn(phone("0105"));
    let auth = { authorization: `Bearer ${token}` };
    const made = await post(`${api}/plans`, { eventId: show, groupType: "open" }, auth);
    expect(made.status).toBe(201);
    const planId = ((await made.json()) as { id: string }).id;
    const state = async () =>
      (await (await fetch(`${api}/plans/${planId}`, { headers: auth })).json()) as { state: string; group: { size: number } | null };

    expect((await operator("send", { phone: phone("0105"), eventId: show })).status).toBe(200);
    expect((await state()).state).toBe("checking_ticket");
    expect((await operator("ticket", { phone: phone("0105"), eventId: show, decision: "reject", reason: "unreadable" })).status).toBe(200);
    expect((await state()).state).toBe("ticket_rejected");
    expect((await operator("send", { phone: phone("0105"), eventId: show })).status).toBe(200);
    expect((await operator("ticket", { phone: phone("0105"), eventId: show, decision: "approve" })).status).toBe(200);
    expect((await state()).state).toBe("finding_group");

    expect((await operator("crowd", { eventId: show, phones: [phone("0106"), phone("0107"), phone("0108")] })).status).toBe(200);
    const grouped = await state();
    expect(grouped.state).toBe("group_confirmed");
    expect(grouped.group?.size).toBe(4);

    // Past T-24h the group locks, and from then on it keeps going with three. The routes act at the server's clock.
    const moved = await post(
      `${api}/__test/clock`,
      { advanceMs: 25 * 3600 * 1000, tick: true },
      { "x-staging-test-token": other.testToken },
    );
    expect(moved.status).toBe(200);
    expect((await operator("withdraw", { phone: phone("0108"), eventId: show })).status).toBe(200);
    // The access token is short-lived and the clock moved a day: the app would refresh, this signs in again.
    auth = { authorization: `Bearer ${await signIn(phone("0105"))}` };
    const shrunk = await state();
    expect(shrunk.group?.size).toBe(3);
    expect((await operator("withdraw", { phone: phone("0108"), eventId: show })).status).toBe(409);
  } finally {
    await other.stop();
  }
}, 90_000);
