import type { Database } from "bun:sqlite";
import { timingSafeEqual } from "node:crypto";
import { createMute, deleteMute, getEvent, getRun, HttpError, listEvents, listMutes, listRuns, listSources } from "./api.js";
import type { StartRun } from "./runs.js";

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?)$/i;

export const isLoopback = (host: string): boolean => LOOPBACK.test(host);

export interface Bind {
  host: string;
  token?: string;
}

/**
 * Where the panel may listen. Loopback unless ADMIN_HOST says otherwise, and a
 * non-loopback host is refused without ADMIN_TOKEN: the panel can start syncs
 * and edit mute rules, so it never listens on a network unauthenticated.
 */
export function resolveBind(env: Record<string, string | undefined>): Bind {
  const host = env.ADMIN_HOST?.trim() || "127.0.0.1";
  const token = env.ADMIN_TOKEN || undefined;
  if (!isLoopback(host) && !token) {
    throw new Error(`ADMIN_HOST=${host} is not a loopback address; set ADMIN_TOKEN to expose the admin panel.`);
  }
  return { host, token };
}

export interface AdminContext {
  /** Read-only handle: every GET. */
  read: Database;
  /** The only handle that writes, and only mute_rule. */
  write: Database;
  startRun: StartRun;
  agentRunsDir: string;
  /** When set, every request must carry `Authorization: Bearer <token>`. */
  token?: string;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Constant-time compare, so a wrong token leaks nothing about a right one. */
function tokenMatches(request: Request, token: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${token}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Returns a rejection, or null when the request may proceed. */
export function guard(request: Request, token?: string): Response | null {
  if (token && !tokenMatches(request, token)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
  }
  // A page on another origin can make the browser send a request to localhost.
  // Its Host header would be the attacker's name after DNS rebinding, so only
  // accept the loopback names while no token is protecting the panel.
  if (!token && !isLoopback(new URL(request.url).hostname)) return new Response("Forbidden", { status: 403 });
  return null;
}

async function readJson(request: Request): Promise<unknown> {
  // Requiring JSON forces a CORS preflight on cross-origin POSTs, which this server never answers.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "send application/json");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

type Handler = (ctx: AdminContext, request: Request, url: URL, params: [string, ...string[]]) => Response | Promise<Response>;

const ROUTES: [method: string, pattern: RegExp, handler: Handler][] = [
  ["GET", /^\/api\/sources$/, (c) => json({ sources: listSources(c.read) })],
  ["GET", /^\/api\/runs$/, (c, _r, url) => json(listRuns(c.read, url.searchParams))],
  ["GET", /^\/api\/runs\/([^/]+)$/, (c, _r, _u, [id]) => json(getRun(c.read, id, c.agentRunsDir))],
  ["POST", /^\/api\/runs$/, async (c, r) => json(c.startRun(await readJson(r)), 202)],
  ["GET", /^\/api\/events$/, (c, _r, url) => json(listEvents(c.read, url.searchParams))],
  ["GET", /^\/api\/events\/([^/]+)$/, (c, _r, _u, [id]) => json(getEvent(c.read, id))],
  ["GET", /^\/api\/mutes$/, (c) => json(listMutes(c.read))],
  ["POST", /^\/api\/mutes$/, async (c, r) => json(createMute(c.write, await readJson(r)), 201)],
  [
    "DELETE",
    /^\/api\/mutes\/([^/]+)$/,
    (c, _r, _u, [id]) => {
      deleteMute(c.write, id);
      return new Response(null, { status: 204 });
    },
  ],
];

export async function apiResponse(ctx: AdminContext, request: Request): Promise<Response> {
  const denied = guard(request, ctx.token);
  if (denied) return denied;

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  let pathMatched = false;
  try {
    for (const [method, pattern, handler] of ROUTES) {
      const match = pattern.exec(pathname);
      if (!match) continue;
      pathMatched = true;
      if (method !== request.method) continue;
      // Every pattern that destructures params has a mandatory capture group.
      return await handler(ctx, request, url, match.slice(1).map(decodeURIComponent) as [string, ...string[]]);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error("admin api error:", error);
    return json({ error: "internal error" }, 500);
  }
  return pathMatched ? json({ error: "method not allowed" }, 405) : json({ error: "not found" }, 404);
}
