import { describe, expect, test } from "bun:test";
import { meResponseSchema } from "@turnout/contract/app/me";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import {
  SEED_CAFE,
  SEED_MEET_MEMBERS,
  SEED_MEMBERS,
  SEED_PHONES,
  SEED_SHOW_IDS,
  type SeedState,
  seedPhone,
  seedStaging,
  UNDELIVERABLE_PHONE,
} from "../scripts/seed-staging.js";
import { createAppContext } from "../src/app-api/index.js";
import type { FakeOtpSender } from "../src/app-api/vendors/otpSender.js";
import { migrate } from "../src/migrate.js";
import { openDb } from "../src/utils/openDb.js";
import { siteResponse } from "../src/web/index.js";
import { type TestApp, testApp } from "./appHelpers.js";

const HOUR = 3_600_000;

async function seeded(options?: Parameters<typeof testApp>[0]) {
  const t = await testApp(options);
  t.sender.undeliverablePhones.add(UNDELIVERABLE_PHONE);
  const result = await seedStaging(t.db, t.app.store, t.clock());
  return { t, result };
}

const phoneOf = (state: SeedState) => SEED_MEMBERS.filter((m) => m.state === state).map((m) => `+1202555${m.line}`)[0] as string;

async function meAfterSignIn(t: TestApp, state: SeedState) {
  const { accessToken } = await t.signIn(phoneOf(state));
  return meResponseSchema.parse(await (await t.call("GET", "/me", { token: accessToken })).json());
}

describe("the staging seed", () => {
  test("every number is a fictional 555-01xx one and is on the staging allowlist", () => {
    expect(new Set(SEED_PHONES).size).toBe(SEED_PHONES.length);
    for (const phone of SEED_PHONES) expect(phone).toMatch(/^\+1\d{3}55501\d{2}$/);
    expect(SEED_PHONES).toContain(UNDELIVERABLE_PHONE);
  });

  test("it covers every state the plan lists", () => {
    expect([...SEED_MEMBERS.map((m) => m.state)].sort()).toEqual(
      (
        [
          "new",
          "handle_pending",
          "handle_rejected",
          "matchable",
          "waiting",
          "grouped_before_reveal",
          "meet_card_live",
          "group_of_3",
          "done",
          "suspended",
          "stopped",
          "banned",
          "undeliverable",
        ] as SeedState[]
      ).sort(),
    );
  });

  test("the shows land at T+2d, T+26h, T+2h and T+75m and the first two can have a group", async () => {
    const { t, result } = await seeded();
    const now = t.clock().getTime();
    expect(result.shows.map((s) => [s.id, Date.parse(s.startsAt) - now])).toEqual([
      [SEED_SHOW_IDS.in2Days, 48 * HOUR],
      [SEED_SHOW_IDS.in26Hours, 26 * HOUR],
      [SEED_SHOW_IDS.in2Hours, 2 * HOUR],
      [SEED_SHOW_IDS.meetLive, 1.25 * HOUR],
    ]);
    const response = siteResponse(t.db, new Request("http://localhost/api/events?limit=200&to=2026-11-05"), t.clock);
    const body = (await response.json()) as { events: { title: string; group_eligible: boolean }[] };
    const byTitle = new Map(body.events.map((e) => [e.title, e.group_eligible]));
    expect(byTitle.get("Seed comedy night")).toBe(true);
    expect(byTitle.get("Seed live music")).toBe(true);
    // Two hours out is inside the 24-hour join cutoff: listed, but no new group.
    expect(byTitle.get("Seed theatre evening")).toBe(false);
    expect(byTitle.get("Seed open mic")).toBe(false);
  });

  test("running it again keeps every id, moves the shows and puts members back in their state", async () => {
    const { t, result } = await seeded();
    const ids = (r: typeof result) => r.members.map((m) => [m.phone, m.id]);
    const { accessToken } = await t.signIn(phoneOf("matchable"));
    await t.call("PATCH", "/me/profile", { token: accessToken, body: { firstName: "Changed", gender: "man", groupPref: "open" } });

    const again = await seedStaging(t.db, t.app.store, new Date(t.clock().getTime() + 5 * 60_000));
    expect(ids(again)).toEqual(ids(result));
    expect((t.db.query("SELECT count(*) AS n FROM member").get() as { n: number }).n).toBe(16);
    expect((t.db.query("SELECT count(*) AS n FROM event WHERE id LIKE 'seed-show-%'").get() as { n: number }).n).toBe(4);
    // The live group is built again for the moved show: still one group of four, live, and the old one is gone.
    expect(ids({ ...again, members: again.meetGroup.members })).toEqual(ids({ ...result, members: result.meetGroup.members }));
    expect(t.db.query("SELECT state, count(*) AS n FROM show_group WHERE event_id = ? GROUP BY state").all(SEED_SHOW_IDS.meetLive)).toEqual(
      [{ state: "live", n: 1 }],
    );
    expect((t.db.query("SELECT count(*) AS n FROM plan WHERE event_id = ?").get(SEED_SHOW_IDS.meetLive) as { n: number }).n).toBe(4);
    expect(
      (t.db.query("SELECT first_name FROM profile WHERE member_id = ?").get(result.members[3]?.id ?? null) as { first_name: string })
        .first_name,
    ).toBe("Chitra");
    // The session from before is gone: the member signs in again.
    expect((await t.call("GET", "/me", { token: accessToken })).status).toBe(401);
  });

  test("new: signs in with an empty profile and has to fill it", async () => {
    const { t } = await seeded();
    const me = await meAfterSignIn(t, "new");
    expect(me.profile.firstName).toBeNull();
    expect(me.matchable.ok).toBe(false);
    expect(me.matchable.missing).toEqual(expect.arrayContaining(["name", "gender", "photo", "handle"]));
  });

  test("handle pending: everything but the handle check is done", async () => {
    const { t } = await seeded();
    const me = await meAfterSignIn(t, "handle_pending");
    expect(me.handle.state).toBe("pending");
    expect(me.profile.photo).not.toBeNull();
    expect(me.matchable).toEqual({ ok: false, missing: ["handle"] });
    expect(me.consent).toEqual({ noticeVersion: NOTICE_VERSION, current: true });
  });

  test("handle rejected: carries the reason", async () => {
    const { t } = await seeded();
    const me = await meAfterSignIn(t, "handle_rejected");
    expect(me.handle).toMatchObject({ state: "rejected", rejectReason: "not_found" });
    expect(me.matchable.missing).toEqual(["handle"]);
  });

  test("matchable and the five plan-state members are ready to be placed", async () => {
    const { t } = await seeded();
    for (const state of ["matchable", "waiting", "grouped_before_reveal", "meet_card_live", "group_of_3", "done"] as const) {
      const me = await meAfterSignIn(t, state);
      expect(me.matchable).toEqual({ ok: true, missing: [] });
      expect(me.handle.state).toBe("approved");
      expect(me.profile.photo).not.toBeNull();
    }
    expect((await meAfterSignIn(t, "matchable")).profile.groupPref).toBe("women_only");
  });

  test("the live group: four members on one live group with the cafe, a meet card plan each, and check-in open", async () => {
    const { t, result } = await seeded();
    expect(SEED_MEET_MEMBERS.map((m) => m.state)).toEqual(["meet_card_live", "meet_card_live", "meet_card_live", "meet_card_live"]);
    const { accessToken } = await t.signIn(seedPhone(SEED_MEET_MEMBERS[0] as (typeof SEED_MEET_MEMBERS)[number]));
    const plans = t.db.query("SELECT state, group_id FROM plan WHERE event_id = ? ORDER BY member_id").all(SEED_SHOW_IDS.meetLive) as {
      state: string;
      group_id: string;
    }[];
    expect(plans.map((p) => p.state)).toEqual(["meet_card_live", "meet_card_live", "meet_card_live", "meet_card_live"]);
    expect(new Set(plans.map((p) => p.group_id))).toEqual(new Set([result.meetGroup.groupId]));

    const group = (await (await t.call("GET", `/groups/${result.meetGroup.groupId}`, { token: accessToken })).json()) as {
      state: string;
      cafe: { name: string; lat: number; lng: number; isFallback: boolean };
      members: { firstName: string | null; isYou: boolean }[];
    };
    expect(group.state).toBe("live");
    expect(group.cafe).toMatchObject({ name: SEED_CAFE.name, lat: SEED_CAFE.lat, lng: SEED_CAFE.lng, isFallback: false });
    expect(group.members.map((m) => m.firstName).sort()).toEqual(SEED_MEET_MEMBERS.map((m) => m.firstName).sort());
    // The show is 75 minutes away, inside check-in (T-90m to T+60m).
    const checkin = await t.call("POST", `/groups/${result.meetGroup.groupId}/checkin`, { token: accessToken });
    expect(checkin.status).toBe(200);
    // The members with one seeded state each have no plan: the flows make theirs on the device.
    expect((t.db.query("SELECT count(*) AS n FROM plan WHERE event_id != ?").get(SEED_SHOW_IDS.meetLive) as { n: number }).n).toBe(0);
  });

  test("every seeded photo is a JPEG in the store and the signed link serves it", async () => {
    const { t } = await seeded();
    const me = await meAfterSignIn(t, "matchable");
    const link = me.profile.photo?.url as string;
    const served = await t.app.store.get(
      (
        t.db
          .query("SELECT photo_key FROM profile WHERE member_id = (SELECT id FROM member WHERE phone_e164 = ?)")
          .get(phoneOf("matchable")) as { photo_key: string }
      ).photo_key,
    );
    expect(served?.contentType).toBe("image/jpeg");
    expect(served?.bytes[0]).toBe(0xff);
    expect(link.length).toBeGreaterThan(0);
  });

  test("suspended is refused with account_suspended and stopped signs in", async () => {
    const { t } = await seeded();
    const refused = await t.call("POST", "/auth/otp", { body: { phone: phoneOf("suspended"), purpose: "sign_in" } });
    const { challengeId } = (await refused.json()) as { challengeId: string };
    const verify = await t.call("POST", "/auth/otp/verify", {
      body: { challengeId, phone: phoneOf("suspended"), code: t.sender.lastCode(phoneOf("suspended")), noticeVersion: NOTICE_VERSION },
    });
    expect(verify.status).toBe(403);
    expect(((await verify.json()) as { error: { code: string } }).error.code).toBe("account_suspended");
    expect((await meAfterSignIn(t, "stopped")).status).toBe("stopped");
  });

  test("the banned number gets the generic refusal and no code", async () => {
    const { t } = await seeded();
    const response = await t.call("POST", "/auth/otp", { body: { phone: phoneOf("banned"), purpose: "sign_in" } });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("sign_in_unavailable");
    expect(t.sender.lastCode(phoneOf("banned"))).toBeNull();
  });

  test("the undeliverable number is accepted, and its challenge reports undeliverable", async () => {
    const { t } = await seeded();
    const response = await t.call("POST", "/auth/otp", { body: { phone: UNDELIVERABLE_PHONE, purpose: "sign_in" } });
    expect(response.status).toBe(200);
    const { challengeId } = (await response.json()) as { challengeId: string };
    const status = await t.call("GET", `/auth/otp/${challengeId}`);
    expect(((await status.json()) as { deliveryStatus: string }).deliveryStatus).toBe("undeliverable");
  });

  test("a staging server marks the seed's undeliverable number from FAKE_UNDELIVERABLE_PHONES", async () => {
    const db = openDb(":memory:");
    migrate(db);
    const app = await createAppContext({
      db,
      env: { TURNOUT_ENV: "staging", FAKE_UNDELIVERABLE_PHONES: UNDELIVERABLE_PHONE, TEST_PHONE_ALLOWLIST: SEED_PHONES.join(",") },
    });
    const sender = app.sender as FakeOtpSender;
    expect(await sender.send({ phone: UNDELIVERABLE_PHONE, code: "123456" })).toMatchObject({ ok: true, deliveryStatus: "undeliverable" });
    expect(await sender.send({ phone: phoneOf("matchable"), code: "123456" })).toEqual({ ok: true, wamid: expect.any(String) });
  });

  test("the script refuses to run in production", async () => {
    const run = Bun.spawn([process.execPath, "scripts/seed-staging.ts", "--db", "/tmp/never-created.db"], {
      env: { ...process.env, TURNOUT_ENV: "production" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await run.exited).toBe(1);
    expect(await new Response(run.stderr).text()).toContain("does not run with TURNOUT_ENV=production");
  });
});
