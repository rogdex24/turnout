import {
  type OtpChallengeResponse,
  type OtpDeliveryStatus,
  otpChallengeResponseSchema,
  otpStatusResponseSchema,
  type TokenPair,
  tokenPairSchema,
} from "@turnout/contract/app/auth";
import { z } from "zod";
import { ApiError, isApiError, offlineError } from "../model/apiError";
import { jwtSubject } from "../model/jwt";
import { type ApiClient, buildUrl, type SessionPort, type Transport } from "./client";
import { type KeyValueStore, PREF_KEYS } from "./prefs";
import { SECRET_KEYS, type SecretStore } from "./secureStorage";

export type SessionStatus = "loading" | "signed_out" | "signed_in";

export interface SessionState {
  status: SessionStatus;
  /** The member id from the access token. Names the cache; never sent anywhere. */
  userId: string | null;
}

export interface Session extends SessionPort {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /** Reads the refresh token from the keychain. Call once at start. */
  load(): Promise<void>;
  signIn(pair: TokenPair): Promise<void>;
  /** Ends the session on this phone only. For after the account was deleted, when the server has no session left to end. */
  endLocal(): Promise<void>;
  /** Runs when the session ends for any reason (sign-out, a refresh the server refused), before the keychain is emptied. */
  onSignedOut(callback: () => void | Promise<void>): void;
}

export interface SessionDeps {
  secure: SecretStore;
  prefs: KeyValueStore;
  origin: string;
  transport: Transport;
  now?: () => number;
  /** Tell the server to end this session. Best effort. */
  revoke?: (accessToken: string) => Promise<void>;
}

/** An access token with less than this left is refreshed before the request, so a call does not start with a token that dies mid-flight. */
const REFRESH_MARGIN_MS = 30_000;

type RefreshOutcome = { kind: "ok"; pair: TokenPair } | { kind: "rejected" } | { kind: "unreachable" };

export function createSession({ secure, prefs, origin, transport, now = Date.now, revoke }: SessionDeps): Session {
  let state: SessionState = { status: "loading", userId: null };
  let accessToken: string | null = null;
  let accessExpiresAt = 0;
  let refreshToken: string | null = null;
  let inFlight: Promise<string | null> | null = null;
  const listeners = new Set<() => void>();
  const signedOutCallbacks: (() => void | Promise<void>)[] = [];

  function set(next: SessionState) {
    state = next;
    for (const listener of listeners) listener();
  }

  async function adopt(pair: TokenPair) {
    // The rotated refresh token is saved before anything else uses the new pair, so a crash after this point still has a usable one.
    await secure.set(SECRET_KEYS.refreshToken, pair.refreshToken);
    refreshToken = pair.refreshToken;
    accessToken = pair.accessToken;
    accessExpiresAt = Date.parse(pair.accessExpiresAt);
    const userId = jwtSubject(pair.accessToken) ?? state.userId;
    if (userId) prefs.set(PREF_KEYS.userId, userId);
    set({ status: "signed_in", userId });
  }

  async function postRefresh(token: string): Promise<RefreshOutcome> {
    try {
      const response = await transport({
        method: "POST",
        url: buildUrl(origin, "app", "/auth/refresh"),
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (response.status === 401 || response.status === 400) return { kind: "rejected" };
      if (response.status !== 200) return { kind: "unreachable" };
      const parsed = tokenPairSchema.safeParse(JSON.parse(response.text));
      return parsed.success ? { kind: "ok", pair: parsed.data } : { kind: "unreachable" };
    } catch {
      return { kind: "unreachable" };
    }
  }

  async function endSession(options: { revokeOnServer: boolean }) {
    const token = accessToken;
    accessToken = null;
    refreshToken = null;
    accessExpiresAt = 0;
    if (options.revokeOnServer && token && revoke) await revoke(token).catch(() => {});
    for (const callback of signedOutCallbacks) await callback();
    await secure.remove(SECRET_KEYS.refreshToken);
    prefs.remove(PREF_KEYS.userId);
    set({ status: "signed_out", userId: null });
  }

  /** One refresh at a time. The server rotates the token and only forgives a retry for 30 seconds, so two parallel calls must share one. */
  function refresh(): Promise<string | null> {
    if (inFlight) return inFlight;
    const token = refreshToken;
    if (token === null) return Promise.resolve(null);
    inFlight = (async () => {
      const outcome = await postRefresh(token);
      if (outcome.kind === "ok") {
        await adopt(outcome.pair);
        return outcome.pair.accessToken;
      }
      if (outcome.kind === "rejected") {
        await endSession({ revokeOnServer: false });
        return null;
      }
      throw offlineError();
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onSignedOut: (callback) => void signedOutCallbacks.push(callback),
    async load() {
      refreshToken = await secure.get(SECRET_KEYS.refreshToken);
      if (refreshToken === null) {
        set({ status: "signed_out", userId: null });
        return;
      }
      set({ status: "signed_in", userId: prefs.getString(PREF_KEYS.userId) ?? null });
    },
    signIn: adopt,
    async accessToken() {
      if (refreshToken === null) return null;
      if (accessToken !== null && accessExpiresAt - now() > REFRESH_MARGIN_MS) return accessToken;
      return refresh();
    },
    async refreshAfterUnauthorised(failedToken) {
      // Another request already refreshed while this one was in flight: use that token, do not rotate again.
      if (accessToken !== null && accessToken !== failedToken && accessExpiresAt - now() > 0) return accessToken;
      return refresh();
    },
    signOut: () => endSession({ revokeOnServer: true }),
    endLocal: () => endSession({ revokeOnServer: false }),
  };
}

/** POST /auth/otp. `bad_phone` is a 400, a refusal (ban, block) is a 403 `sign_in_unavailable`, a cap is 429 or 503. */
export function requestOtp(api: ApiClient, phone: string): Promise<OtpChallengeResponse> {
  return api.request({
    method: "POST",
    path: "/auth/otp",
    auth: false,
    body: { phone, purpose: "sign_in" },
    schema: otpChallengeResponseSchema,
  });
}

export function verifyOtp(
  api: ApiClient,
  input: { challengeId: string; phone: string; code: string; noticeVersion: string },
): Promise<TokenPair> {
  return api.request({ method: "POST", path: "/auth/otp/verify", auth: false, body: input, schema: tokenPairSchema });
}

export async function otpDeliveryStatus(api: ApiClient, challengeId: string): Promise<OtpDeliveryStatus | null> {
  try {
    const { deliveryStatus } = await api.request({
      path: `/auth/otp/${encodeURIComponent(challengeId)}`,
      auth: false,
      schema: otpStatusResponseSchema,
    });
    return deliveryStatus;
  } catch (error) {
    if (isApiError(error) && error.kind === "not_found") return null;
    throw error;
  }
}

export function revokeOnServer(api: ApiClient): (accessToken: string) => Promise<void> {
  return (accessToken) =>
    api
      .request({
        method: "POST",
        path: "/auth/sign-out",
        auth: false,
        headers: { authorization: `Bearer ${accessToken}` },
        schema: z.void(),
      })
      .then(() => undefined);
}

export { ApiError };
