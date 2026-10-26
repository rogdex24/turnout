import { describe, expect, test } from "bun:test";
import { HttpError } from "../src/admin/api.js";
import { type AdminContext, apiResponse, resolveBind } from "../src/admin/server.js";
import { seedAdmin } from "./adminHelpers.js";

describe("resolveBind", () => {
  test("defaults to 127.0.0.1 with no token needed", () => {
    expect(resolveBind({})).toEqual({ host: "127.0.0.1", token: undefined });
    expect(resolveBind({ ADMIN_HOST: "localhost" }).host).toBe("localhost");
    expect(resolveBind({ ADMIN_HOST: "::1" }).host).toBe("::1");
  });

  test("a non-loopback host is refused without ADMIN_TOKEN", () => {
    expect(() => resolveBind({ ADMIN_HOST: "0.0.0.0" })).toThrow(/ADMIN_TOKEN/);
    expect(() => resolveBind({ ADMIN_HOST: "192.168.1.5", ADMIN_TOKEN: "" })).toThrow(/ADMIN_TOKEN/);
  });

  test("a non-loopback host with a token is allowed", () => {
    expect(resolveBind({ ADMIN_HOST: "0.0.0.0", ADMIN_TOKEN: "s3cret" })).toEqual({ host: "0.0.0.0", token: "s3cret" });
  });
});

async function context(token?: string): Promise<AdminContext> {
  const db = await seedAdmin();
  return {
    read: db,
    write: db,
    agentRunsDir: "/nonexistent",
    token,
    startRun: (body) => {
      if ((body as { sources?: string[] })?.sources?.[0] === "busy") throw new HttpError(409, "a sync is already running");
      if ((body as { sources?: string[] })?.sources?.[0] === "nope") throw new HttpError(400, 'unknown source "nope"');
      return { runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", logPath: "x.log" };
    },
  };
}

const call = (ctx: AdminContext, path: string, init: RequestInit & { host?: string } = {}) =>
  apiResponse(ctx, new Request(`http://${init.host ?? "127.0.0.1:3001"}${path}`, init));
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("token", () => {
  test("every request needs the bearer token when one is set", async () => {
    const ctx = await context("s3cret");
    expect((await call(ctx, "/api/sources")).status).toBe(401);
    expect((await call(ctx, "/api/nothing")).status).toBe(401); // even a path that does not exist
    expect((await call(ctx, "/api/sources", { headers: { authorization: "Bearer wrong!" } })).status).toBe(401);
    expect((await call(ctx, "/api/sources", { headers: { authorization: "s3cret" } })).status).toBe(401);
    expect((await call(ctx, "/api/sources", { headers: { authorization: "Bearer s3cret" } })).status).toBe(200);
    // writes too
    expect((await call(ctx, "/api/mutes", json({ field: "source", value: "x" }))).status).toBe(401);
    expect(
      (
        await call(ctx, "/api/mutes", {
          ...json({ field: "source", value: "x" }),
          headers: { "content-type": "application/json", authorization: "Bearer s3cret" },
        })
      ).status,
    ).toBe(201);
  });

  test("without a token, a request for a non-loopback Host is refused (DNS rebinding)", async () => {
    const ctx = await context();
    expect((await call(ctx, "/api/sources")).status).toBe(200);
    expect((await call(ctx, "/api/sources", { host: "localhost:3001" })).status).toBe(200);
    expect((await call(ctx, "/api/sources", { host: "evil.example" })).status).toBe(403);
  });
});

describe("routes", () => {
  test("every route answers with the documented status", async () => {
    const ctx = await context();
    const id = (ctx.read.prepare("SELECT id FROM event LIMIT 1").get() as { id: string }).id;
    const runId = (ctx.read.prepare("SELECT id FROM sync_run").get() as { id: string }).id;

    expect((await call(ctx, "/api/sources")).status).toBe(200);
    expect((await call(ctx, "/api/runs?limit=5")).status).toBe(200);
    expect((await call(ctx, "/api/runs?limit=zero")).status).toBe(400);
    expect((await call(ctx, `/api/runs/${runId}`)).status).toBe(200);
    expect((await call(ctx, "/api/runs/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await call(ctx, "/api/events?pageSize=5")).status).toBe(200);
    expect((await call(ctx, "/api/events?visibility=x")).status).toBe(400);
    expect((await call(ctx, `/api/events/${id}`)).status).toBe(200);
    expect((await call(ctx, "/api/events/missing")).status).toBe(404);
    expect((await call(ctx, "/api/mutes")).status).toBe(200);
    expect((await call(ctx, "/api/other")).status).toBe(404);
    expect((await call(ctx, "/api/sources", { method: "DELETE" })).status).toBe(405);
  });

  test("POST /api/runs: 202 with the run id, 409 when busy, 400 for an unknown source", async () => {
    const ctx = await context();
    const ok = await call(ctx, "/api/runs", json({ sources: ["communitie"] }));
    expect(ok.status).toBe(202);
    expect(await ok.json()).toEqual({ runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", logPath: "x.log" });
    expect((await call(ctx, "/api/runs", json({ sources: ["busy"] }))).status).toBe(409);
    expect((await call(ctx, "/api/runs", json({ sources: ["nope"] }))).status).toBe(400);
  });

  test("bodies must be JSON", async () => {
    const ctx = await context();
    expect((await call(ctx, "/api/mutes", { method: "POST", body: "{}" })).status).toBe(415);
    expect((await call(ctx, "/api/mutes", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" })).status).toBe(
      400,
    );
    expect((await call(ctx, "/api/mutes", json({ field: "bogus", value: "x" }))).status).toBe(400);
  });

  test("mutes: create, list with the hide count, delete", async () => {
    const ctx = await context();
    const created = (await (await call(ctx, "/api/mutes", json({ field: "category", value: "comedy", note: "why" }))).json()) as {
      id: string;
      hides: number;
    };
    expect(created.hides).toBe(1);
    const list = (await (await call(ctx, "/api/mutes")).json()) as { mutes: { id: string }[] };
    expect(list.mutes.map((m) => m.id)).toEqual([created.id]);
    expect((await call(ctx, `/api/mutes/${created.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(ctx, `/api/mutes/${created.id}`, { method: "DELETE" })).status).toBe(404);
  });
});
