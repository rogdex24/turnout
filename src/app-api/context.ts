import type { Database } from "bun:sqlite";
import type { MemberRow } from "../social/members.js";
import type { AdjustableClock, Clock } from "../utils/clock.js";
import type { FetchLike } from "../utils/http.js";
import type { ObjectStore } from "../utils/objectStore.js";
import type { Alerts } from "./alerts.js";
import type { AppConfig } from "./env.js";
import type { OtpSender } from "./vendors/otpSender.js";
import type { PushSender } from "./vendors/push.js";

/** One line per request: what happened, never to whom beyond a hash, and never a body, phone, handle, token or message. */
export interface LogEntry {
  at: string;
  method: string;
  route: string;
  status: number;
  ms: number;
  /** A short SHA-256 of the member id, or absent when the request was not signed in. */
  member?: string;
  /** For a failure nobody expected: the error's class name, nothing else. */
  error?: string;
}

/** Everything a handler needs. Built once in `cli.ts` (or a test) and passed down; nothing below reads the process environment. */
export interface AppContext {
  db: Database;
  now: Clock;
  config: AppConfig;
  store: ObjectStore;
  sender: OtpSender;
  push: PushSender;
  alerts: Alerts;
  fetch: FetchLike;
  log: (entry: LogEntry) => void;
  /** Routes a test adds, for example one to prove a limit. Absent in `serve`. */
  extraRoutes?: Route[];
  /** Only on staging: the clock the test route moves. */
  adjustClock?: AdjustableClock;
}

export interface AuthedMember {
  member: MemberRow;
  sessionId: string;
}

export interface RequestContext {
  app: AppContext;
  request: Request;
  url: URL;
  /** Named parts of the path (`:id`), and `rest` for a `*` pattern. */
  params: Record<string, string>;
  /** The caller's address as the limits see it (`unknown` when there is none). */
  ip: string;
  /** Set on a route with `auth: "member"`. */
  member: AuthedMember | null;
  now: Date;
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Route {
  method: Method;
  /** Below `/api/app/v1`. `:name` takes one path part; a trailing `/*` takes the rest as `rest`. */
  pattern: string;
  /** `member` runs `requireMember()` first; `none` is public. */
  auth: "member" | "none";
  handler: (context: RequestContext) => Promise<Response> | Response;
}
