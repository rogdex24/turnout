import path from "node:path";
import { markSvg } from "../utils/brandMark.js";
import { openDb } from "../utils/openDb.js";
import { createRunStarter } from "./runs.js";
import { type AdminContext, apiResponse, guard, resolveBind } from "./server.js";
import { withThemeBoot } from "./themeBoot.js";
import index from "./ui/index.html";

/** Pages the client router handles; each serves the same HTML shell. */
const PAGES = ["/", "/runs", "/runs/:id", "/sources", "/events", "/mutes"];

export interface AdminOptions {
  dbPath: string;
  port: number;
  env: Record<string, string | undefined>;
}

/** The database must already be migrated: the admin reads `listable_event` and never owns the schema. */
export function startAdmin({ dbPath, port, env }: AdminOptions) {
  const bind = resolveBind(env);
  // Next to the database, where sync puts agent-runs/ (see ingestion/agent/agentSource.ts).
  const dataDir = path.dirname(path.resolve(dbPath));

  const read = openDb(dbPath, { readonly: true });
  // The only connection that writes, and only to mute_rule. It waits out a sync's write transaction instead of failing.
  const write = openDb(dbPath, { create: false });

  const context: AdminContext = {
    read,
    write,
    token: bind.token,
    agentRunsDir: path.join(dataDir, "agent-runs"),
    startRun: createRunStarter({ db: read, dbPath: path.resolve(dbPath), logDir: path.join(dataDir, "admin-runs") }),
  };

  // Bun serves HTML bundles natively, ahead of any fetch handler, so a token check could
  // not cover them. The bundle lives on a private loopback port instead, and the public
  // server proxies to it only after the guard has passed, so every request is checked.
  const shell = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    // No HMR socket: the proxy below forwards plain requests only.
    development: { hmr: false, console: false },
    routes: Object.fromEntries(PAGES.map((page) => [page, index])),
    fetch: () => new Response("Not found", { status: 404 }),
  });

  const server = Bun.serve({
    hostname: bind.host,
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return apiResponse(context, request);
      const denied = guard(request, bind.token);
      if (denied) return denied;
      if (url.pathname === "/favicon.svg")
        return new Response(markSvg(), {
          headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
        });
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      // identity: the inner response is already decoded, so a copied content-encoding would corrupt it.
      const inner = await fetch(new URL(url.pathname + url.search, shell.url), {
        method: request.method,
        headers: { "accept-encoding": "identity" },
      });
      if (!inner.headers.get("content-type")?.includes("text/html")) return inner;
      const headers = new Headers(inner.headers);
      headers.delete("content-length");
      return new Response(request.method === "HEAD" ? null : withThemeBoot(await inner.text()), { status: inner.status, headers });
    },
  });
  return { server, bind };
}
