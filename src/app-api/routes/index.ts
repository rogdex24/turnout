import type { AppContext, Route } from "../context.js";
import { authRoutes } from "./auth.js";
import { configRoutes } from "./config.js";
import { fileRoutes } from "./files.js";
import { healthRoutes } from "./health.js";
import { meRoutes } from "./me.js";
import { testOnlyRoutes } from "./testOnly.js";
import { whatsappWebhookRoutes } from "./whatsappWebhook.js";

/**
 * The route table for one app context. M3 and later add their route lists here. The staging test routes are in the table only
 * outside production and only when a test token is set; in production they are not registered at all.
 */
export function appRoutes(app: AppContext): Route[] {
  const routes = [...healthRoutes, ...configRoutes, ...authRoutes, ...whatsappWebhookRoutes, ...fileRoutes, ...meRoutes];
  if (app.config.env !== "production" && app.config.stagingTestToken !== null) routes.push(...testOnlyRoutes);
  if (app.extraRoutes) routes.push(...app.extraRoutes);
  return routes;
}
