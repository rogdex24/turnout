import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { planListResponseSchema, planSchema, showResponseSchema } from "@turnout/contract/app/plans";
import { type TestApp, testApp } from "./appHelpers.js";
import { makePlan, memberSession } from "./helpers/appFixture.js";
import { SHOW_START, seedShow } from "./helpers/socialFixture.js";

const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;
const HOUR = 3_600_000;

async function setup() {
  const t = await testApp();
  seedShow(t.db, { id: "show-a" });
  return { t, a: await memberSession(t, 0), b: await memberSession(t, 1) };
}

const show = async (t: TestApp, token: string, id: string) => t.call("GET", `/shows/${id}`, { token });

describe("GET /shows/:publicId", () => {
  test("shows the public show, what proof it takes and how many are waiting, with no plan yet", async () => {
    const { t, a } = await setup();
    const response = await show(t, a.token, "show-a");
    expect(response.status).toBe(200);
    const body = showResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      publicId: "show-a",
      title: "Show show-a",
      startsAt: SHOW_START,
      venueName: "Hall show-a",
      lookingCount: 0,
      proofKind: "screenshot_or_pdf",
      plan: null,
    });
    expect(body.joinUntil).toBe(new Date(Date.parse(SHOW_START) - 24 * HOUR).toISOString());
  });

  test("a BookMyShow show takes a screenshot only", async () => {
    const { t, a } = await setup();
    seedShow(t.db, { id: "bms", source: "bookmyshow" });
    expect(showResponseSchema.parse(await (await show(t, a.token, "bms")).json()).proofKind).toBe("screenshot");
  });

  test("a show with nothing to join is the same 404 whatever the reason", async () => {
    const { t, a } = await setup();
    seedShow(t.db, { id: "free", priceMin: 0 });
    seedShow(t.db, { id: "film", category: "film" });
    seedShow(t.db, { id: "soon", startsAt: new Date(t.clock().getTime() + 20 * HOUR).toISOString() });
    const bodies: string[] = [];
    for (const id of ["nope", "free", "film", "soon"]) {
      const response = await show(t, a.token, id);
      expect(response.status).toBe(404);
      bodies.push(JSON.stringify(await errorOf(response)));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  test("carries the caller's own live plan and nobody else's", async () => {
    const { t, a, b } = await setup();
    const plan = await makePlan(t, a, "show-a");
    expect(showResponseSchema.parse(await (await show(t, a.token, "show-a")).json()).plan).toEqual(plan);
    expect(showResponseSchema.parse(await (await show(t, b.token, "show-a")).json()).plan).toBeNull();
  });
});

describe("POST /plans", () => {
  test("makes a plan in needs_ticket with the show copied in, answers 201", async () => {
    const { t, a } = await setup();
    const response = await t.call("POST", "/plans", { token: a.token, body: { eventId: "show-a", groupType: "open" } });
    expect(response.status).toBe(201);
    const plan = planSchema.parse(await response.json());
    expect(plan).toMatchObject({
      eventId: "show-a",
      state: "needs_ticket",
      reason: null,
      groupType: "open",
      show: { title: "Show show-a", startsAt: SHOW_START, venueName: "Hall show-a" },
      ticket: null,
      group: null,
    });
  });

  test("a second plan for the same show is 409 plan_exists and names the first", async () => {
    const { t, a } = await setup();
    const plan = await makePlan(t, a, "show-a");
    const again = await t.call("POST", "/plans", { token: a.token, body: { eventId: "show-a", groupType: "open" } });
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toMatchObject({ code: "plan_exists", planId: plan.id });
  });

  test("a member who is not ready gets 409 not_matchable with what is missing", async () => {
    const { t } = await setup();
    const bare = await memberSession(t, 2, { photo: false, handle: "none" });
    const response = await t.call("POST", "/plans", { token: bare.token, body: { eventId: "show-a", groupType: "open" } });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: "not_matchable", missing: ["photo", "handle"] });
  });

  test("a pending handle is enough to make a plan", async () => {
    const { t } = await setup();
    const pending = await memberSession(t, 2, { handle: "pending" });
    expect((await t.call("POST", "/plans", { token: pending.token, body: { eventId: "show-a", groupType: "open" } })).status).toBe(201);
  });

  test("women_only is 400 for a man and fine for a woman", async () => {
    const { t, a } = await setup();
    const refused = await t.call("POST", "/plans", { token: a.token, body: { eventId: "show-a", groupType: "women_only" } });
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).code).toBe("women_only");
    const woman = await memberSession(t, 2, { gender: "woman" });
    expect((await t.call("POST", "/plans", { token: woman.token, body: { eventId: "show-a", groupType: "women_only" } })).status).toBe(201);
  });

  test("an unknown show is 404, and the body is strict", async () => {
    const { t, a } = await setup();
    expect((await t.call("POST", "/plans", { token: a.token, body: { eventId: "nope", groupType: "open" } })).status).toBe(404);
    for (const body of [
      { eventId: "show-a" },
      { eventId: "show-a", groupType: "open", memberId: "x" },
      { eventId: "show-a", groupType: "mixed" },
    ]) {
      expect((await t.call("POST", "/plans", { token: a.token, body })).status).toBe(400);
    }
  });

  test("ten plans a day, then 429 with a retry time", async () => {
    const { t, a } = await setup();
    for (let i = 0; i < 10; i++) {
      seedShow(t.db, { id: `many-${i}` });
      expect((await t.call("POST", "/plans", { token: a.token, body: { eventId: `many-${i}`, groupType: "open" } })).status).toBe(201);
    }
    seedShow(t.db, { id: "many-x" });
    const over = await t.call("POST", "/plans", { token: a.token, body: { eventId: "many-x", groupType: "open" } });
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).not.toBeNull();
  });
});

describe("GET /plans and GET /plans/:planId", () => {
  test("a member sees their own plans and another member's plan is the same 404 as a missing one", async () => {
    const { t, a, b } = await setup();
    const plan = await makePlan(t, a, "show-a");
    const list = planListResponseSchema.parse(await (await t.call("GET", "/plans", { token: a.token })).json());
    expect(list.plans.map((p) => p.id)).toEqual([plan.id]);
    expect(planListResponseSchema.parse(await (await t.call("GET", "/plans", { token: b.token })).json()).plans).toEqual([]);
    expect(planSchema.parse(await (await t.call("GET", `/plans/${plan.id}`, { token: a.token })).json())).toEqual(plan);
    const foreign = await t.call("GET", `/plans/${plan.id}`, { token: b.token });
    const missing = await t.call("GET", "/plans/01hzzzzzzzzzzzzzzzzzzzzzzz", { token: b.token });
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
  });
});

describe("POST /plans/:planId/withdraw", () => {
  test("withdraws with no body or an empty one, and a second withdraw is 409 plan_closed", async () => {
    const { t, a } = await setup();
    const plan = await makePlan(t, a, "show-a");
    const first = await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token });
    expect(first.status).toBe(200);
    expect(planSchema.parse(await first.json())).toMatchObject({ id: plan.id, state: "withdrawn", reason: "cancelled" });
    const second = await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token, body: {} });
    expect(second.status).toBe(409);
    expect((await errorOf(second)).code).toBe("plan_closed");
  });

  test("a body with a field is 400, and someone else's plan is 404 and stays live", async () => {
    const { t, a, b } = await setup();
    const plan = await makePlan(t, a, "show-a");
    expect((await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token, body: { reason: "x" } })).status).toBe(400);
    expect((await t.call("POST", `/plans/${plan.id}/withdraw`, { token: b.token })).status).toBe(404);
    expect(planSchema.parse(await (await t.call("GET", `/plans/${plan.id}`, { token: a.token })).json()).state).toBe("needs_ticket");
  });

  test("after a withdraw the member can make a new plan for the show", async () => {
    const { t, a } = await setup();
    const plan = await makePlan(t, a, "show-a");
    await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token });
    expect((await makePlan(t, a, "show-a")).id).not.toBe(plan.id);
  });
});
