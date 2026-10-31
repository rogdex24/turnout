import type { z } from "zod";
import { ApiError, classifyFailure, isApiError, offlineError } from "../model/apiError";
import type { Connectivity } from "./connectivity";

export interface RawResponse {
  status: number;
  text: string;
  retryAfter: string | null;
}

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | Blob | null;
  onProgress?: (sent: number, total: number) => void;
}

/** One HTTP round trip. Throws when there is no answer at all (no network, timeout), which the client turns into `offline`. */
export type Transport = (request: TransportRequest) => Promise<RawResponse>;

const TIMEOUT_MS = 20_000;

export const fetchTransport: Transport = async ({ method, url, headers, body, onProgress }) => {
  if (onProgress && body !== null) return xhrTransport({ method, url, headers, body, onProgress });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    return { status: response.status, text: await response.text(), retryAfter: response.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
};

/** fetch has no upload progress on React Native, XMLHttpRequest does. Used only for the photo. */
function xhrTransport({ method, url, headers, body, onProgress }: TransportRequest): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = TIMEOUT_MS * 3;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded, event.total);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText, retryAfter: xhr.getResponseHeader("retry-after") });
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new TypeError("Network request timed out"));
    xhr.send(body as Blob);
  });
}

/** What the client needs from the signed-in session. */
export interface SessionPort {
  /** The access token, refreshed first when it is about to run out. Null when signed out. Throws `offline` when it cannot refresh. */
  accessToken(): Promise<string | null>;
  /** The request with `failedToken` got a 401. Refreshes once (joining a refresh already running) and returns the new token, or null after signing out. */
  refreshAfterUnauthorised(failedToken: string): Promise<string | null>;
  signOut(): Promise<void>;
}

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A path on the app API (`/me`), or on the API origin when `root` is "origin" (`/api/events`). */
  path: string;
  schema: z.ZodType<T>;
  query?: Record<string, string | number | undefined>;
  /** A JSON body, or a Blob sent as it is (the photo). */
  body?: unknown;
  /** Extra headers, for example `Idempotency-Key`. */
  headers?: Record<string, string>;
  /** Public routes (config, sign-in, the catalog) send no token. Default true. */
  auth?: boolean;
  root?: "app" | "origin";
  onProgress?: (sent: number, total: number) => void;
}

export interface ApiClient {
  request<T>(options: RequestOptions<T>): Promise<T>;
}

export const APP_API_PATH = "/api/app/v1";

export interface ClientDeps {
  origin: string;
  session: SessionPort;
  connectivity: Connectivity;
  transport?: Transport;
}

export function buildUrl(origin: string, root: "app" | "origin", path: string, query?: RequestOptions<unknown>["query"]): string {
  const params = Object.entries(query ?? {})
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return `${origin.replace(/\/+$/, "")}${root === "app" ? APP_API_PATH : ""}${path}${params.length ? `?${params.join("&")}` : ""}`;
}

/**
 * The one way the app talks to the server. Every success is parsed with a Zod schema, every failure becomes an `ApiError`. A 401 on a
 * signed-in call refreshes the session once and retries once; a second 401 signs the person out.
 */
export function createApiClient({ origin, session, connectivity, transport = fetchTransport }: ClientDeps): ApiClient {
  async function send(options: RequestOptions<unknown>, token: string | null): Promise<RawResponse> {
    // The public routes send max-age, and the Android HTTP cache would answer a pull to refresh without asking the server, which
    // also hides that the network is gone. React Query is the app's cache.
    const headers: Record<string, string> = { accept: "application/json", "cache-control": "no-cache", ...options.headers };
    let body: string | Blob | null = null;
    if (options.body instanceof Blob) {
      body = options.body;
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["content-type"] = "application/json";
    }
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      const response = await transport({
        method: options.method ?? "GET",
        url: buildUrl(origin, options.root ?? "app", options.path, options.query),
        headers,
        body,
        onProgress: options.onProgress,
      });
      connectivity.report(true);
      return response;
    } catch (error) {
      if (isApiError(error)) throw error;
      connectivity.report(false);
      throw offlineError();
    }
  }

  return {
    async request<T>(options: RequestOptions<T>): Promise<T> {
      const authed = options.auth !== false;
      let token: string | null = null;
      if (authed) {
        token = await session.accessToken();
        if (token === null) throw new ApiError("unauthorised", 401, null);
      }
      let response = await send(options, token);
      if (authed && response.status === 401 && token !== null) {
        const next = await session.refreshAfterUnauthorised(token);
        if (next === null) throw new ApiError("unauthorised", 401, null);
        response = await send(options, next);
        if (response.status === 401) {
          await session.signOut();
          throw new ApiError("unauthorised", 401, null);
        }
      }
      if (response.status < 200 || response.status >= 300) throw classifyFailure(response.status, response.text, response.retryAfter);
      return parseSuccess(options.schema, response);
    },
  };
}

function parseSuccess<T>(schema: z.ZodType<T>, response: RawResponse): T {
  let data: unknown;
  if (response.text !== "") {
    try {
      data = JSON.parse(response.text);
    } catch {
      throw new ApiError("server", response.status, "bad_response");
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError("server", response.status, "bad_response");
  return parsed.data;
}
