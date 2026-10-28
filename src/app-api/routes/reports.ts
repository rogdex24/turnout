import { type CreateReportResponse, createReportRequestSchema } from "@turnout/contract/app/reports";
import { checkReport, createReport, newReportAlert, reportByClientId } from "../../social/reports.js";
import { markAlertSent } from "../../social/tick.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { invalidRequest, notFound } from "../errors.js";
import { json, parseBody } from "../http.js";
import { enforce } from "../rateLimit.js";

export const reportRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/reports",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row } = authed(member);
      const t = app.config.tunables;
      const input = await parseBody(request, createReportRequestSchema);
      // A retry of a report that is already stored answers with it and does not count against the limit.
      const stored = reportByClientId(app.db, row.id, input.clientId);
      if (stored !== null) {
        if (stored.group_id !== input.groupId) throw invalidRequest("that clientId was used for another report");
        return json(200, { reportId: stored.id } satisfies CreateReportResponse);
      }
      const check = checkReport(app.db, row.id, input, now, t);
      if (!check.ok) {
        if (check.error === "not_found") throw notFound();
        throw invalidRequest("that message is not one of theirs in this group");
      }
      enforce(app.db, app.config.otpPepper, "report:create", row.id, t.rate.reportPerDay, now);
      const result = createReport(app.db, row.id, input, now, t);
      if (!result.ok) {
        if (result.error === "not_found") throw notFound();
        throw invalidRequest("that message is not one of theirs in this group");
      }
      if (result.created) {
        // The ticker sends it again if this is lost: the alert is marked sent only after notify returns.
        const alert = newReportAlert(result.reportId);
        await app.alerts.notify(alert.kind, alert.text).then(
          () => markAlertSent(app.db, alert.key, now),
          () => {},
        );
      }
      return json(result.created ? 201 : 200, { reportId: result.reportId } satisfies CreateReportResponse);
    },
  },
];
