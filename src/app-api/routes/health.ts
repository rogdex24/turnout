import type { Route } from "../context.js";
import { ok } from "../http.js";

export const healthRoutes: Route[] = [{ method: "GET", pattern: "/health", auth: "none", handler: () => ok({ status: "ok" }) }];
