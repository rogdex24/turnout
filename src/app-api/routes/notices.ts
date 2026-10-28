import {
  type Notice,
  type NoticeListResponse,
  type NoticeReadResponse,
  noticeListQuerySchema,
  noticeReadRequestSchema,
} from "@turnout/contract/app/notices";
import { listNotices, markNoticesRead } from "../../social/notices.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { ok, parseBody, parseQuery } from "../http.js";

export const noticeRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/notices",
    auth: "member",
    handler: ({ app, url, member }) => {
      const query = parseQuery(url, noticeListQuerySchema);
      const notices: Notice[] = listNotices(app.db, authed(member).member.id, query.after).map((n) => ({
        id: n.id,
        kind: n.kind,
        planId: n.plan_id,
        groupId: n.group_id,
        createdAt: n.created_at,
        readAt: n.read_at,
      }));
      return ok({ notices } satisfies NoticeListResponse);
    },
  },
  {
    method: "POST",
    pattern: "/notices/read",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const input = await parseBody(request, noticeReadRequestSchema);
      return ok({ marked: markNoticesRead(app.db, authed(member).member.id, input.upTo, now) } satisfies NoticeReadResponse);
    },
  },
];
