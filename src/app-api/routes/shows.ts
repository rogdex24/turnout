import type { ShowResponse } from "@turnout/contract/app/plans";
import { proofKindForSource } from "@turnout/contract/ticket";
import { livePlanFor } from "../../social/plans.js";
import { getEligibleShow, lookingCount } from "../../social/shows.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { notFound } from "../errors.js";
import { ok } from "../http.js";
import { planView } from "../presenters.js";

export const showRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/shows/:publicId",
    auth: "member",
    handler: ({ app, params, member, now }) => {
      const { member: row } = authed(member);
      // A show that is missing, unlisted, free, not placed, or past T-24h is the same 404: there is nothing to join.
      const show = getEligibleShow(app.db, params.publicId as string, now, app.config.tunables);
      if (show === null) throw notFound();
      const plan = livePlanFor(app.db, row.id, show.dedupeKey);
      const body: ShowResponse = {
        publicId: show.id,
        title: show.title,
        startsAt: show.startsAt,
        joinUntil: show.joinUntil,
        venueName: show.venueName,
        area: show.area || null,
        category: show.category,
        priceMin: show.priceMin,
        lookingCount: lookingCount(app.db, show.id),
        proofKind: proofKindForSource(show.source),
        plan: plan === null ? null : planView(app, plan),
      };
      return ok(body);
    },
  },
];
