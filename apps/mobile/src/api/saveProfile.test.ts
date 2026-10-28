import type { QueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@turnout/contract/app/me";
import { isApiError } from "../model/apiError";
import type { SaveStep } from "../model/profileForm";
import { meFixture } from "../providers/testing";
import { createApiClient } from "./client";
import { createConnectivity } from "./connectivity";
import { queryKeys } from "./keys";
import { PHOTO_UNREADABLE, runSave, SaveError } from "./saveProfile";
import { clearTestClients, json, type RouteReply, routedTransport, testQueryClient } from "./testing";

afterEach(() => clearTestClients());

const PROFILE: SaveStep = { call: "profile", body: { firstName: "Ananya", gender: "woman", groupPref: "open" } };
const PHOTO: SaveStep = { call: "photo" };
const HANDLE: SaveStep = { call: "handle", body: { kind: "instagram", handle: "ananya.k" } };
const LINK = { url: "/files/new", expiresAt: "2026-10-26T10:05:00.000Z" };

function setup(routes: Record<string, RouteReply | RouteReply[]>, start: MeResponse = meFixture()) {
  const net = routedTransport(routes);
  const api = createApiClient({
    origin: "http://test.local",
    session: { accessToken: async () => "tok", refreshAfterUnauthorised: async () => null, signOut: async () => undefined },
    connectivity: createConnectivity(),
    transport: net.transport,
  });
  const queryClient: QueryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.me(), start);
  const progress: number[] = [];
  const env = { api, queryClient, loadPhoto: async () => new Blob(["x"]), onUploadProgress: (f: number) => progress.push(f) };
  const cachedMe = () => queryClient.getQueryData<MeResponse>(queryKeys.me());
  return { net, env, cachedMe, progress };
}

describe("runSave", () => {
  it("makes the calls in order and keeps the cached me current", async () => {
    const empty = meFixture({
      profile: { firstName: null, gender: null, photo: null },
      handle: { state: "missing", kind: null, handle: null },
    });
    const { net, env, cachedMe } = setup(
      {
        "PATCH /me/profile": json(200, meFixture({ profile: { photo: null }, handle: { state: "missing", kind: null, handle: null } })),
        "PUT /me/photo": json(200, { photo: LINK }),
        "PUT /me/handle": json(200, { state: "pending" }),
      },
      empty,
    );
    await runSave(env, [PROFILE, PHOTO, HANDLE]);
    expect(net.calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "PATCH /api/app/v1/me/profile",
      "PUT /api/app/v1/me/photo",
      "PUT /api/app/v1/me/handle",
    ]);
    expect(JSON.parse(String(net.calls[0]?.body))).toEqual({ firstName: "Ananya", gender: "woman", groupPref: "open" });
    expect(JSON.parse(String(net.calls[2]?.body))).toEqual({ kind: "instagram", handle: "ananya.k" });
    expect(cachedMe()?.profile.photo).toEqual(LINK);
    expect(cachedMe()?.handle).toEqual({ state: "pending", kind: "instagram", handle: "ananya.k", rejectReason: null });
  });

  it("sends the picture as a body of its own and reports progress from the transport", async () => {
    const { net, env, progress } = setup({
      "PUT /me/photo": (request) => {
        request.onProgress?.(50, 200);
        request.onProgress?.(200, 200);
        return json(200, { photo: LINK });
      },
    });
    await runSave(env, [PHOTO]);
    expect(net.calls[0]?.body).toBeInstanceOf(Blob);
    expect(net.calls[0]?.headers["content-type"]).toBeUndefined();
    expect(progress).toEqual([0, 0.25, 1]);
  });

  it("sends an approved handle back to pending in the cache when the photo changes", async () => {
    const { env, cachedMe } = setup({ "PUT /me/photo": json(200, { photo: LINK }) }, meFixture({ handle: { state: "approved" } }));
    await runSave(env, [PHOTO]);
    expect(cachedMe()?.handle.state).toBe("pending");
  });

  it("stops at the call that failed, names it and keeps what went through", async () => {
    const { net, env, cachedMe } = setup({
      "PATCH /me/profile": json(200, meFixture({ profile: { firstName: "Ananya K" } })),
      "PUT /me/photo": json(400, { error: { code: "unsupported_type", message: "no" } }),
      "PUT /me/handle": json(200, { state: "pending" }),
    });
    const failure = await runSave(env, [PROFILE, PHOTO, HANDLE]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SaveError);
    expect((failure as SaveError).step).toBe("photo");
    expect((failure as SaveError).reason.code).toBe("unsupported_type");
    expect(net.calls).toHaveLength(2);
    expect(cachedMe()?.profile.firstName).toBe("Ananya K");
  });

  it("reports a picture that cannot be read as a photo problem and sends nothing", async () => {
    const { net, env } = setup({});
    const failure = await runSave({ ...env, loadPhoto: async () => Promise.reject(new Error("gone")) }, [PHOTO]).catch(
      (error: unknown) => error,
    );
    expect((failure as SaveError).step).toBe("photo");
    expect((failure as SaveError).reason.code).toBe(PHOTO_UNREADABLE);
    expect(net.calls).toHaveLength(0);
  });

  it("says offline as an api error on the step that could not go", async () => {
    const { env } = setup({ "PUT /me/handle": new Error("dead network") });
    const failure = await runSave(env, [HANDLE]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SaveError);
    expect(isApiError((failure as SaveError).reason)).toBe(true);
    expect((failure as SaveError).reason.kind).toBe("offline");
  });
});
