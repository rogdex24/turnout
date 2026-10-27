import type { ConfigResponse } from "@turnout/contract/app/config";
import { NOTICE_TEXT, NOTICE_VERSION } from "@turnout/contract/app/notice";
import type { Route } from "../context.js";
import { ok } from "../http.js";

export const configRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/config",
    auth: "none",
    handler: ({ app }) => {
      const { config } = app;
      const body: ConfigResponse = {
        notice: { version: NOTICE_VERSION, text: NOTICE_TEXT },
        push: config.push,
        support: config.support,
        minAppVersion: config.minAppVersion,
        grievance: config.grievance,
      };
      // Not about a person, so a short shared cache is fine.
      return ok(body, { "cache-control": "public, max-age=60" });
    },
  },
];
