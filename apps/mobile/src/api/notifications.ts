import { registerDeviceResponseSchema } from "@turnout/contract/app/devices";
import { type Notice, noticeListResponseSchema, type PushPayload } from "@turnout/contract/app/notices";
import { z } from "zod";
import { holdsThreadPush, needsGroupId, parsePushData, routeForNotice, UNKNOWN_PUSH_ROUTE } from "@/model/notificationRoute";
import type { ApiClient } from "./client";
import { type KeyValueStore, PREF_KEYS } from "./prefs";

export type PushPermission = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean };

/** What the app needs of the phone's notification service, so the rules below can be tested without a phone. */
export interface PushNative {
  platform: "android" | "ios" | "other";
  permission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  /** The Expo push token (`ExponentPushToken[...]`). Throws when the build has no EAS project or no Firebase file. */
  expoToken(): Promise<string>;
  setUpChannels(): Promise<void>;
  /** Calls `handler` with the data of each notification the person taps, including the one that started the app. Returns the way to stop. */
  onTap(handler: (data: unknown) => void): () => void;
  /** Decides, for a push that arrives with the app open, whether the phone shows it. */
  setForegroundHandler(decide: (data: unknown) => Promise<ForegroundBehavior>): void;
}

export type RegisterOutcome =
  | { kind: "registered"; deviceId: string }
  | { kind: "unchanged" }
  | { kind: "skipped"; reason: "platform_off" | "not_asked" | "denied" | "no_token" };

const StoredDevice = z.object({ userId: z.string(), token: z.string(), deviceId: z.string() });

function readStored(prefs: KeyValueStore) {
  const raw = prefs.getString(PREF_KEYS.pushDevice);
  if (raw === undefined) return null;
  try {
    const parsed = StoredDevice.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface RegisterInput {
  api: ApiClient;
  prefs: KeyValueStore;
  native: PushNative;
  /** `GET /config` `push`: the server's word on which platforms it sends to. iOS is off until an Apple account exists. */
  pushEnabled: { android: boolean; ios: boolean };
  userId: string | null;
  /** True only when the person just said yes to our own question, so the system's permission question may be asked now. */
  mayAsk: boolean;
}

/**
 * Gives the server this phone's push token, once per person and token. Android only while the server says so: iOS never registers,
 * and the person reads their notices on open instead. A person who said no is not asked again by the app, and nothing is sent.
 */
export async function registerDevice({ api, prefs, native, pushEnabled, userId, mayAsk }: RegisterInput): Promise<RegisterOutcome> {
  if (native.platform === "other" || !pushEnabled[native.platform] || userId === null) return { kind: "skipped", reason: "platform_off" };
  let permission = await native.permission();
  if (permission.status === "undetermined" && permission.canAskAgain) {
    if (!mayAsk) return { kind: "skipped", reason: "not_asked" };
    permission = await native.requestPermission();
  }
  if (permission.status !== "granted") return { kind: "skipped", reason: "denied" };

  let token: string;
  try {
    token = await native.expoToken();
  } catch {
    return { kind: "skipped", reason: "no_token" };
  }
  const stored = readStored(prefs);
  if (stored && stored.userId === userId && stored.token === token) return { kind: "unchanged" };

  const { deviceId } = await api.request({
    method: "POST",
    path: "/devices",
    body: { expoPushToken: token, platform: native.platform },
    schema: registerDeviceResponseSchema,
  });
  prefs.set(PREF_KEYS.pushDevice, JSON.stringify({ userId, token, deviceId }));
  return { kind: "registered", deviceId };
}

const permissionListeners = new Set<() => void>();

/** The ticket page's question was answered yes and the system asked: the registration runs again, so a grant reaches the server. */
export function permissionChanged(): void {
  for (const listener of permissionListeners) listener();
}

export function onPermissionChanged(listener: () => void): () => void {
  permissionListeners.add(listener);
  return () => void permissionListeners.delete(listener);
}

/**
 * Takes this phone's device off the server at sign-out. Call it when sign-out starts: it reads the stored device then and forgets it,
 * because the wipe empties the stored facts before the call is made. The call it returns runs afterwards with an access token the
 * session no longer holds. Only the sign-out route removes devices on the server, so this call is what does it; it is best effort:
 * a phone with no network signs out anyway.
 */
export function removeDeviceOnSignOut(api: ApiClient, prefs: KeyValueStore): (accessToken: string) => Promise<void> {
  const stored = readStored(prefs);
  prefs.remove(PREF_KEYS.pushDevice);
  return async (accessToken) => {
    if (stored === null) return;
    try {
      await api.request({
        method: "DELETE",
        path: `/devices/${encodeURIComponent(stored.deviceId)}`,
        auth: false,
        headers: { authorization: `Bearer ${accessToken}` },
        schema: z.void(),
      });
    } catch {
      // A device the server no longer has, or no network: either way the person is signed out.
    }
  };
}

/** How many pages of notices are read to find one: a hundred each, and a person has few in the 30 days they are kept. */
const NOTICE_PAGES = 5;
const NOTICE_PAGE_SIZE = 100;

/** The notice a push is about. The server lists notices newer than an id and has no read by id, so the pages are walked. */
export async function findNotice(api: ApiClient, noticeId: string): Promise<Notice | null> {
  let after: string | undefined;
  for (let page = 0; page < NOTICE_PAGES; page += 1) {
    const { notices } = await api.request({ path: "/notices", query: { after }, schema: noticeListResponseSchema });
    const hit = notices.find((notice) => notice.id === noticeId);
    if (hit) return hit;
    const last = notices.at(-1);
    if (notices.length < NOTICE_PAGE_SIZE || last === undefined) return null;
    after = last.id;
  }
  return null;
}

/** The group a push is about, read from its notice. Null when the notice cannot be found or the network is down. */
async function groupIdOf(api: ApiClient, payload: PushPayload): Promise<string | null> {
  try {
    return (await findNotice(api, payload.noticeId))?.groupId ?? null;
  } catch {
    return null;
  }
}

/**
 * Where a tap goes. Push data that is not ours opens Home. A kind that opens a group screen reads the group from the notice (the push
 * carries ids of the plan only); when that cannot be read the plan opens instead.
 */
export async function resolveTapRoute(api: ApiClient, data: unknown): Promise<string> {
  const payload = parsePushData(data);
  if (payload === null) return UNKNOWN_PUSH_ROUTE;
  const groupId = needsGroupId(payload.kind) ? await groupIdOf(api, payload) : null;
  return routeForNotice(payload.kind, { planId: payload.planId, groupId });
}

let openThread: string | null = null;

/** The thread screen calls this while it is on screen, and calls the function it returns when it leaves. */
export function holdThreadPushes(groupId: string): () => void {
  openThread = groupId;
  return () => {
    if (openThread === groupId) openThread = null;
  };
}

export interface ForegroundBehavior {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

const SHOWN: ForegroundBehavior = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
const HIDDEN: ForegroundBehavior = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

/** A push that arrives with the app open is shown, except a message for the thread the person is reading. */
export async function foregroundBehavior(api: ApiClient, data: unknown): Promise<ForegroundBehavior> {
  const payload = parsePushData(data);
  if (payload === null || payload.kind !== "thread_message" || openThread === null) return SHOWN;
  return holdsThreadPush(payload.kind, await groupIdOf(api, payload), openThread) ? HIDDEN : SHOWN;
}
