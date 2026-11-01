import type { QueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@turnout/contract/app/me";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { type KeyValueStore, memoryKv, PREF_KEYS } from "../api/prefs";
import { memorySecretStore, SECRET_KEYS } from "../api/secureStorage";
import { json, type RouteReply, routedTransport, testQueryClient, tokenPairBody } from "../api/testing";
import type { WhatsAppOtp } from "../api/whatsappOtp";
import { type AppDeps, createAppDeps } from "./deps";

export const TEST_ORIGIN = "http://test.local";
export const TEST_USER = "member-1";

/** A complete member: name, gender, photo and a handle waiting for review. Pass what differs. */
export function meFixture(
  over: {
    status?: MeResponse["status"];
    profile?: Partial<MeResponse["profile"]>;
    handle?: Partial<MeResponse["handle"]>;
    consent?: boolean;
  } = {},
): MeResponse {
  return {
    status: over.status ?? "active",
    phoneLast4: "0123",
    profile: {
      firstName: "Ananya",
      gender: "woman",
      groupPref: "open",
      photo: { url: "/files/photo", expiresAt: "2026-10-26T10:00:00.000Z" },
      ...over.profile,
    },
    handle: { state: "pending", kind: "instagram", handle: "ananya.k", rejectReason: null, ...over.handle },
    matchable: { ok: true, missing: [] },
    consent: { noticeVersion: NOTICE_VERSION, current: over.consent ?? true },
  };
}

export interface TestAppOptions {
  /** Signed in with this member (the answer to `GET /me`), or signed out when left out. */
  me?: MeResponse;
  welcomeSeen?: boolean;
  /** The notice version stored on this phone before sign-in. */
  acceptedNotice?: string;
  routes?: Record<string, RouteReply | RouteReply[]>;
  /** The disk cache as the last run left it, for a warm start. Empty when left out. */
  cacheStore?: KeyValueStore;
  now?: () => number;
  whatsappOtp?: WhatsAppOtp;
  /** What sign-out does to the image cache, the picked files, the notifications and telemetry, to be watched. */
  clearImages?: () => Promise<void>;
  clearPickedFiles?: () => Promise<void>;
  clearNotifications?: () => Promise<void>;
  stopTelemetry?: () => void;
}

export interface TestApp {
  deps: AppDeps;
  queryClient: QueryClient;
  transport: ReturnType<typeof routedTransport>;
  prefs: ReturnType<typeof memoryKv>;
  secure: ReturnType<typeof memorySecretStore>;
  /** The store behind the disk copy of the query cache. */
  cacheStore: ReturnType<typeof memoryKv>;
}

/** The real wiring over in-memory stores and a scripted network, for router and screen tests. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const now = options.now ?? Date.now;
  const prefs = memoryKv();
  const secure = memorySecretStore();
  if (options.welcomeSeen) prefs.set(PREF_KEYS.welcomeSeen, "1");
  if (options.acceptedNotice) prefs.set(PREF_KEYS.acceptedNotice, options.acceptedNotice);
  const routes: Record<string, RouteReply | RouteReply[]> = {};
  if (options.me) {
    await secure.set(SECRET_KEYS.refreshToken, "refresh-seed-0123456789abcdef");
    prefs.set(PREF_KEYS.userId, TEST_USER);
    routes["POST /auth/refresh"] = () => json(200, tokenPairBody(TEST_USER, "seed", 15 * 60_000, now()));
    routes["GET /me"] = json(200, options.me);
  }
  const transport = routedTransport({ ...routes, ...options.routes });
  const queryClient = testQueryClient();
  const cacheStore = options.cacheStore ?? memoryKv();
  const deps = await createAppDeps({
    secure,
    prefs,
    cacheStore,
    origin: TEST_ORIGIN,
    transport: transport.transport,
    appVersion: "0.0.0-test",
    queryClient,
    now,
    whatsappOtp: options.whatsappOtp,
    clearImages: options.clearImages,
    clearPickedFiles: options.clearPickedFiles,
    clearNotifications: options.clearNotifications,
    stopTelemetry: options.stopTelemetry,
  });
  return { deps, queryClient, transport, prefs, secure, cacheStore };
}
