import { leaseStatus } from "../../social/tick.js";
import type { Route } from "../context.js";
import { AppError } from "../errors.js";
import { ok } from "../http.js";

/**
 * Whether the process can serve: the database takes a write lock, and the ticker has finished a pass lately. The answer holds
 * the age of the last pass in seconds (null before the first one), so a monitor can see a ticker that has stopped.
 */
export const healthRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/health",
    auth: "none",
    handler: ({ app, now }) => {
      try {
        app.db.transaction(() => {}).immediate();
      } catch {
        throw new AppError(503, "server_error", "the database is not writable");
      }
      const lease = leaseStatus(app.db);
      const lastTick = lease?.lastTickAt ?? null;
      return ok({
        status: "ok",
        ticker: { lastTickAgeSeconds: lastTick === null ? null : Math.max(0, Math.round((now.getTime() - Date.parse(lastTick)) / 1000)) },
      });
    },
  },
];
