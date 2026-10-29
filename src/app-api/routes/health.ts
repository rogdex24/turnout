import { leaseStatus } from "../../social/tick.js";
import type { AppContext, Route } from "../context.js";
import { AppError } from "../errors.js";
import { ok } from "../http.js";

/**
 * Whether the process can serve: the database takes a write lock (checked at most every 5 seconds), and the ticker has finished a pass lately. The answer holds
 * the age of the last pass in seconds (null before the first one), so a monitor can see a ticker that has stopped.
 */
/** The write-lock check is not repeated for every poll: a monitor and a load balancer together would otherwise take the lock all day. */
const WRITE_CHECK_MS = 5000;
const writeChecks = new WeakMap<AppContext, { at: number; writable: boolean }>();

function databaseWritable(app: AppContext, now: Date): boolean {
  const last = writeChecks.get(app);
  if (last !== undefined && now.getTime() - last.at >= 0 && now.getTime() - last.at < WRITE_CHECK_MS) return last.writable;
  let writable = true;
  try {
    app.db.transaction(() => {}).immediate();
  } catch {
    writable = false;
  }
  writeChecks.set(app, { at: now.getTime(), writable });
  return writable;
}

export const healthRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/health",
    auth: "none",
    handler: ({ app, now }) => {
      if (!databaseWritable(app, now)) throw new AppError(503, "server_error", "the database is not writable");
      const lease = leaseStatus(app.db);
      const lastTick = lease?.lastTickAt ?? null;
      return ok({
        status: "ok",
        ticker: { lastTickAgeSeconds: lastTick === null ? null : Math.max(0, Math.round((now.getTime() - Date.parse(lastTick)) / 1000)) },
      });
    },
  },
];
