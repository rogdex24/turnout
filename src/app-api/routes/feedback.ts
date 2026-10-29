import { type BlockedResponse, downvoteRequestSchema } from "@turnout/contract/app/feedback";
import { blockedPeople, downvote } from "../../social/feedback.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { AppError, notFound } from "../errors.js";
import { ok, parseBody } from "../http.js";

export const feedbackRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/groups/:groupId/downvotes",
    auth: "member",
    handler: async ({ app, request, params, member, now }) => {
      const { member: row } = authed(member);
      const input = await parseBody(request, downvoteRequestSchema);
      const result = downvote(app.db, params.groupId as string, row.id, input.memberRef, now, app.config.tunables);
      if (!result.ok) {
        // Not a group of yours, yourself and a ref that is not in it are the same 404; a wrong time on a group you can see is a 409.
        if (result.error === "not_found") throw notFound();
        throw new AppError(409, "outside_window", "feedback is open for 72 hours after the morning after the show");
      }
      return new Response(null, { status: 204 });
    },
  },
  {
    method: "GET",
    pattern: "/me/blocked",
    auth: "member",
    handler: ({ app, member }) => {
      const { member: row } = authed(member);
      return ok({ blocked: blockedPeople(app.db, row.id) } satisfies BlockedResponse);
    },
  },
];
