import type { Database } from "bun:sqlite";
import { timingSafeEqual } from "node:crypto";
import {
  approveHandleAction,
  approveTicketAction,
  banAction,
  closeReportAction,
  contactedAction,
  createMute,
  deleteMute,
  eraseAction,
  findAccountByPhone,
  getAccount,
  getEvent,
  getRun,
  HttpError,
  handlePhotoKey,
  liftBanAction,
  listEvents,
  listFailedNotices,
  listHandles,
  listMutes,
  listReports,
  listRuns,
  listSources,
  listTickets,
  listUpcomingShows,
  putCafe,
  putStartTime,
  reinstateAction,
  rejectHandleAction,
  rejectTicketAction,
  suspendAction,
  ticketFile,
} from "./api.js";
import { type AdminFiles, verifyAdminLink } from "./files.js";
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
  /** The only handle that writes: mute rules, and through social/operator.ts the tickets, handles, start times, cafes, reports, accounts and the ban list. */
  write: Database;
  startRun: StartRun;
  agentRunsDir: string;
  /** The stored tickets and photos, and the secret that signs the links to them. Null when the admin has none, so no link is shown. */
  files?: AdminFiles | null;
  /** The same BAN_PEPPER as the app. Without it the ban and lift routes answer 503: a number hashed with another pepper would never match. */
  banPepper?: string | null;
  now?: () => Date;
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
  // A write must come from the panel's own page. A cross-site form or no-cors fetch needs no preflight and may carry no body at all
  // (approve has none), so reading the body is no defence: the browser names the origin of every such request instead.
  if (!token && request.method !== "GET" && request.method !== "HEAD" && !fromOwnPage(request))
    return new Response("Forbidden", { status: 403 });
  return null;
}

/** False when the browser says the request began on another site. A client that sends neither header (curl, a script) is not a browser page. */
function fromOwnPage(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  return origin === null || (URL.canParse(origin) && new URL(origin).host === new URL(request.url).host);
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

const noContent = () => new Response(null, { status: 204 });

/** The bytes of a stored file. An image opens in the tab; a PDF or anything else downloads, and nothing is ever run as a page. */
async function fileResponse(files: AdminFiles | null | undefined, key: string, mime: string): Promise<Response> {
  const stored = files ? await files.store.get(key) : null;
  if (!stored) throw new HttpError(404, "the file is not there");
  const inline = mime.startsWith("image/");
  return new Response(Buffer.from(stored.bytes), {
    headers: {
      "content-type": inline ? mime : "application/octet-stream",
      "content-disposition": inline ? "inline" : "attachment",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "no-store",
    },
  });
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
      return noContent();
    },
  ],
  ["GET", /^\/api\/tickets$/, (c) => json(listTickets(c.read, c.files ?? null, clock(c)()))],
  [
    "GET",
    /^\/api\/tickets\/([^/]+)\/file$/,
    (c, _r, _u, [id]) => {
      const file = ticketFile(c.read, id);
      return fileResponse(c.files, file.key, file.mime);
    },
  ],
  ["POST", /^\/api\/tickets\/([^/]+)\/approve$/, (c, _r, _u, [id]) => json(approveTicketAction(c.write, id, clock(c)()))],
  [
    "POST",
    /^\/api\/tickets\/([^/]+)\/reject$/,
    async (c, r, _u, [id]) => json(rejectTicketAction(c.write, id, await readJson(r), clock(c)())),
  ],
  ["GET", /^\/api\/shows$/, (c) => json(listUpcomingShows(c.read, clock(c)()))],
  ["PUT", /^\/api\/events\/([^/]+)\/start-time$/, async (c, r, _u, [id]) => json(putStartTime(c.write, id, await readJson(r), clock(c)()))],
  ["PUT", /^\/api\/groups\/([^/]+)\/cafe$/, async (c, r, _u, [id]) => json(putCafe(c.write, id, await readJson(r), clock(c)()))],
  ["GET", /^\/api\/handles$/, (c, _r, url) => json(listHandles(c.read, c.files ?? null, url.searchParams, clock(c)()))],
  ["GET", /^\/api\/handles\/([^/]+)\/photo$/, (c, _r, _u, [id]) => fileResponse(c.files, handlePhotoKey(c.read, id), "image/jpeg")],
  ["POST", /^\/api\/handles\/([^/]+)\/approve$/, (c, _r, _u, [id]) => json(approveHandleAction(c.write, id, clock(c)()))],
  [
    "POST",
    /^\/api\/handles\/([^/]+)\/reject$/,
    async (c, r, _u, [id]) => json(rejectHandleAction(c.write, id, await readJson(r), clock(c)())),
  ],
  ["GET", /^\/api\/reports$/, (c) => json(listReports(c.read, clock(c)()))],
  ["POST", /^\/api\/reports\/([^/]+)\/contacted$/, (c, _r, _u, [id]) => json(contactedAction(c.write, id, clock(c)()))],
  [
    "POST",
    /^\/api\/reports\/([^/]+)\/close$/,
    async (c, r, _u, [id]) => json(await closeReportAction(c.write, c.banPepper, c.files ?? null, id, await readJson(r), clock(c)())),
  ],
  ["POST", /^\/api\/accounts\/find$/, async (c, r) => json(findAccountByPhone(c.read, await readJson(r)))],
  ["GET", /^\/api\/accounts\/([^/]+)$/, (c, _r, _u, [id]) => json(getAccount(c.read, id))],
  ["POST", /^\/api\/accounts\/([^/]+)\/suspend$/, (c, _r, _u, [id]) => json(suspendAction(c.write, id, clock(c)()))],
  ["POST", /^\/api\/accounts\/([^/]+)\/reinstate$/, (c, _r, _u, [id]) => json(reinstateAction(c.write, c.banPepper, id, clock(c)()))],
  [
    "POST",
    /^\/api\/accounts\/([^/]+)\/erase$/,
    async (c, _r, _u, [id]) => json(await eraseAction(c.write, c.files ?? null, id, clock(c)())),
  ],
  [
    "POST",
    /^\/api\/accounts\/([^/]+)\/ban$/,
    async (c, _r, _u, [id]) => json(await banAction(c.write, c.banPepper, c.files ?? null, id, clock(c)())),
  ],
  ["POST", /^\/api\/bans\/lift$/, async (c, r) => json(liftBanAction(c.write, c.banPepper, await readJson(r), clock(c)()))],
  ["GET", /^\/api\/notices$/, (c, _r, url) => json(listFailedNotices(c.read, url.searchParams))],
];

const clock = (ctx: AdminContext): (() => Date) => ctx.now ?? (() => new Date());

/** The two routes a browser tab opens by link, where no bearer token can ride along. Their signed link stands in for it. */
const SIGNED_FILE_PATH = /^\/api\/(tickets\/[^/]+\/file|handles\/[^/]+\/photo)$/;

export async function apiResponse(ctx: AdminContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const signed =
    request.method === "GET" &&
    SIGNED_FILE_PATH.test(pathname) &&
    ctx.files != null &&
    verifyAdminLink(ctx.files, pathname, url.searchParams, clock(ctx)());
  // A valid signature is the whole credential for that one file, on any host, with or without a token.
  const denied = signed ? null : guard(request, ctx.token);
  if (denied) return denied;

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
