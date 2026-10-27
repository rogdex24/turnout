import type { Database } from "bun:sqlite";
import { type Clock, systemClock } from "../utils/clock.js";

/** Everything a handler needs. Built once in `cli.ts` and passed down; nothing below reads the process environment. */
export interface AppContext {
  db: Database;
  now: Clock;
  env: Record<string, string | undefined>;
}

/** Where the app API lives. `cli.ts` sends every path under it here and everything else to the site. */
export const APP_PREFIX = "/api/app/";

export interface AppContextOptions {
  db: Database;
  env: Record<string, string | undefined>;
  now?: Clock;
}

export function createAppContext({ db, env, now = systemClock }: AppContextOptions): AppContext {
  return { db, now, env };
}

/** Background upkeep for the app API. `serve --no-ticker` skips it. Returns a function that stops it. */
export function startTicker(_ctx: AppContext): () => void {
  return () => {};
}

export async function appResponse(_ctx: AppContext, _request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: { code: "not_found", message: "not found" } }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
