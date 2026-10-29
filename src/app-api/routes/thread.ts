import { type MessageListResponse, messageListQuerySchema, postMessageRequestSchema } from "@turnout/contract/app/thread";
import { listMessages, messageByClientId, postMessage, postWindow } from "../../social/thread.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { AppError, invalidRequest, notFound } from "../errors.js";
import { json, ok, parseBody, parseQuery } from "../http.js";
import { enforce } from "../rateLimit.js";

export const threadRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/groups/:groupId/messages",
    auth: "member",
    handler: ({ app, url, params, member, now }) => {
      const { member: row } = authed(member);
      const query = parseQuery(url, messageListQuerySchema);
      // Before T-3h, for someone who is not in the group, and from the show plus 30 days: the same 404 as a group that is not theirs.
      const result = listMessages(app.db, params.groupId as string, row.id, query.after, now, app.config.tunables);
      if (!result.ok) throw notFound();
      return ok({ messages: result.messages, thread: result.thread } satisfies MessageListResponse);
    },
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/messages",
    auth: "member",
    handler: async ({ app, request, params, member, now }) => {
      const { member: row } = authed(member);
      const groupId = params.groupId as string;
      const t = app.config.tunables;
      const input = await parseBody(request, postMessageRequestSchema);
      const window = postWindow(app.db, groupId, row.id, now, t);
      if (window === "not_found") throw notFound();
      if (window === "closed") throw new AppError(409, "outside_window", "the thread is read-only 24 hours after the show starts");
      // A retry of a message that is already stored answers with it and does not count against the limit.
      const stored = messageByClientId(app.db, groupId, row.id, input.clientId);
      if (stored !== null) return ok(stored);
      enforce(app.db, app.config.otpPepper, "message:post", row.id, t.rate.messagesPerMinute, now);
      const result = postMessage(app.db, groupId, row.id, input, now, t);
      if (!result.ok) {
        if (result.error === "not_found") throw notFound();
        if (result.error === "closed") throw new AppError(409, "outside_window", "the thread is read-only 24 hours after the show starts");
        throw invalidRequest("that clientId was used for another message");
      }
      return json(result.created ? 201 : 200, result.message);
    },
  },
];
