import type { AppContext, Route } from "../context.js";
import { authRoutes } from "./auth.js";
import { configRoutes } from "./config.js";
import { deviceRoutes } from "./devices.js";
import { feedbackRoutes } from "./feedback.js";
import { fileRoutes } from "./files.js";
import { groupRoutes } from "./groups.js";
import { healthRoutes } from "./health.js";
import { meRoutes } from "./me.js";
import { noticeRoutes } from "./notices.js";
import { planRoutes } from "./plans.js";
import { showRoutes } from "./shows.js";
import { testOnlyRoutes } from "./testOnly.js";
import { threadRoutes } from "./thread.js";
import { whatsappWebhookRoutes } from "./whatsappWebhook.js";

/**
 * The route table for one app context. Later milestones add their route lists here. The staging test routes are in the table only
 * outside production and only when a test token is set; in production they are not registered at all.
 */
export function appRoutes(app: AppContext): Route[] {
  const routes = [
    ...healthRoutes,
    ...configRoutes,
    ...authRoutes,
    ...whatsappWebhookRoutes,
    ...fileRoutes,
    ...meRoutes,
    ...showRoutes,
    ...planRoutes,
    ...groupRoutes,
    ...threadRoutes,
    ...feedbackRoutes,
    ...noticeRoutes,
    ...deviceRoutes,
  ];
  if (app.config.env !== "production" && app.config.stagingTestToken !== null) routes.push(...testOnlyRoutes);
  if (app.extraRoutes) routes.push(...app.extraRoutes);
  return routes;
}
