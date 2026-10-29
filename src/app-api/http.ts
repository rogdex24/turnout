import { createHash } from "node:crypto";
import { ERROR_CODES, type ErrorCode } from "@turnout/contract/app/errors";
import type { z } from "zod";
import { requireMember } from "./auth.js";
import type { AppContext, Method, RequestContext, Route } from "./context.js";
import { AppError, type ErrorExtra, invalidRequest, notFound } from "./errors.js";

/** Every app API path starts with this. */
export const API_BASE = "/api/app/v1";

/** The most a JSON body may hold. Photos use their own, larger limit. */
export const MAX_JSON_BYTES = 16 * 1024;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Everything here is about one person: no shared cache keeps it.
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function ok(body: unknown, headers: Record<string, string> = {}): Response {
  return json(200, body, headers);
}

export function errorBody(
  code: ErrorCode,
  message: string,
  extra: ErrorExtra = {},
): { error: { code: ErrorCode; message: string } & ErrorExtra } {
  return { error: { code, message, ...extra } };
}

export function errorResponse(error: AppError): Response {
  return json(error.status, errorBody(error.code, error.message, error.extra), error.headers);
}

/** `Retry-After` whole seconds, at least 1. */
export function retryAfter(seconds: number): Record<string, string> {
  return { "retry-after": String(Math.max(1, Math.ceil(seconds))) };
}

/**
 * Reads a request body up to `maxBytes`. A `Content-Length` over the limit is refused before reading anything; a body with no
 * length (or a wrong one) is counted as it arrives and the read is cancelled the moment it passes the limit, so a huge upload never
 * sits in memory.
 */
export async function readBytes(request: Request, maxBytes: number, code: ErrorCode = "payload_too_large"): Promise<Uint8Array> {
  const tooLarge = (): AppError => new AppError(413, code, `the body is larger than ${maxBytes} bytes`);
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw tooLarge();
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

const KNOWN_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

const CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  women_only: "women-only groups are for women and non-binary people",
  bad_handle: "that is not a handle or profile link we can read",
};

/** A failed parse as a 400. The text says which field and what is wrong; it never repeats the value. */
export function validationError(error: z.ZodError): AppError {
  const issue = error.issues[0];
  if (issue === undefined) return invalidRequest("the request is not valid");
  if (KNOWN_CODES.has(issue.message)) {
    const code = issue.message as ErrorCode;
    return new AppError(400, code, CODE_MESSAGES[code] ?? "the request is not valid");
  }
  if (issue.code === "unrecognized_keys") return invalidRequest(`${issue.keys[0] ?? "body"}: unknown field`);
  const path = issue.path.map(String).join(".");
  return invalidRequest(path ? `${path}: ${issue.message}` : issue.message);
}

/** The JSON body of a request, checked against a contract schema. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S, maxBytes = MAX_JSON_BYTES): Promise<z.output<S>> {
  const bytes = await readBytes(request, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidRequest("the body must be JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

/** The body of a request that needs none: nothing at all is fine, and so is `{}`. Anything else is refused. */
export async function parseEmptyBody<S extends z.ZodType>(request: Request, schema: S): Promise<void> {
  const bytes = await readBytes(request, 256);
  if (bytes.length === 0) return;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidRequest("the body must be empty or JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
}

export function parseQuery<S extends z.ZodType>(url: URL, schema: S): z.output<S> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

/**
 * The caller's address for the limits. Behind a proxy the configured header holds it (`x-forwarded-for` can list several, and the
 * last entry is the one our own proxy added); without one, the socket's address.
 */
export function clientIp(request: Request, header: string | null, peerIp: string | null): string {
  if (header !== null) {
    const value = request.headers.get(header);
    if (value) {
      const last = value.split(",").at(-1)?.trim();
      if (last) return last;
    }
  }
  return peerIp ?? "unknown";
}

function memberHash(memberId: string): string {
  return createHash("sha256").update(memberId).digest("hex").slice(0, 12);
}

interface CompiledRoute {
  route: Route;
  parts: string[];
  wildcard: boolean;
}

export interface Router {
  find(
    method: string,
    path: string,
  ): { kind: "match"; route: Route; params: Record<string, string> } | { kind: "method"; allow: Method[] } | { kind: "none" };
}

/** Turns patterns like `/auth/otp/:challengeId` and `/files/*` into a lookup. */
export function createRouter(routes: readonly Route[]): Router {
  const compiled: CompiledRoute[] = routes.map((route) => {
    const parts = route.pattern.split("/").filter(Boolean);
    const wildcard = parts.at(-1) === "*";
    return { route, parts: wildcard ? parts.slice(0, -1) : parts, wildcard };
  });
  return {
    find(method, path) {
      const segments = path.split("/").filter(Boolean);
      const allow: Method[] = [];
      for (const entry of compiled) {
        const params: Record<string, string> = {};
        const fits = entry.wildcard ? segments.length > entry.parts.length : segments.length === entry.parts.length;
        if (!fits) continue;
        const same = entry.parts.every((part, index) => {
          const segment = segments[index] as string;
          if (part.startsWith(":")) {
            params[part.slice(1)] = segment;
            return true;
          }
          return part === segment;
        });
        if (!same) continue;
        if (entry.wildcard) params.rest = segments.slice(entry.parts.length).join("/");
        if (entry.route.method === method) return { kind: "match", route: entry.route, params };
        allow.push(entry.route.method);
      }
      return allow.length > 0 ? { kind: "method", allow: [...new Set(allow)] } : { kind: "none" };
    },
  };
}

/**
 * The whole request path: find the route, check the member, run the handler, turn a thrown AppError into the error body, and
 * write one log line (method, route pattern, status, duration, member hash). Anything unexpected is a 500 with no detail.
 */
export async function handleRequest(app: AppContext, router: Router, request: Request, peerIp: string | null): Promise<Response> {
  const started = performance.now();
  const now = app.now();
  let response: Response;
  let route = "(unmatched)";
  let member: string | undefined;
  let failure: string | undefined;
  try {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${API_BASE}/`)) throw notFound();
    const found = router.find(request.method, url.pathname.slice(API_BASE.length));
    if (found.kind === "none") throw notFound();
    if (found.kind === "method") throw new AppError(405, "method_not_allowed", "method not allowed", { allow: found.allow.join(", ") });
    route = found.route.pattern;
    const context: RequestContext = {
      app,
      request,
      url,
      params: found.params,
      ip: clientIp(request, app.config.trustProxyHeader, peerIp),
      member: null,
      now,
    };
    if (found.route.auth === "member") {
      context.member = await requireMember(context, found.route.allowSuspended === true);
      member = memberHash(context.member.member.id);
    }
    response = await found.route.handler(context);
  } catch (error) {
    if (error instanceof AppError) {
      response = errorResponse(error);
    } else {
      failure = error instanceof Error ? error.name : "unknown";
      response = errorResponse(new AppError(500, "server_error", "something went wrong"));
    }
  }
  app.log({
    at: now.toISOString(),
    method: request.method,
    route,
    status: response.status,
    ms: Math.round(performance.now() - started),
    member,
    error: failure,
  });
  return response;
}
