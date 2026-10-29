import {
  type Cafe,
  type CheckinResponse,
  checkinRequestSchema,
  type GroupResponse,
  type MemberPhotoResponse,
} from "@turnout/contract/app/groups";
import { downvotedRefs } from "../../social/feedback.js";
import { belowPlan, checkIn, getGroupForMember, groupSize, memberPhotoKey, revealedMembers } from "../../social/groups.js";
import { canReveal, meetAt, milestones, revealAt, revealClosed } from "../../social/model/schedule.js";
import { getPlan } from "../../social/plans.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { AppError, notFound } from "../errors.js";
import { ok, parseEmptyBody } from "../http.js";
import { fileLink } from "../presenters.js";

export const groupRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/groups/:groupId",
    auth: "member",
    handler: ({ app, params, member, now }) => {
      const { member: row } = authed(member);
      const t = app.config.tunables;
      // Not a group, not yours, left, dissolved and called off are one and the same 404.
      const found = getGroupForMember(app.db, params.groupId as string, row.id);
      if (found === null) throw notFound();
      const { group, mine } = found;
      if (revealClosed({ startsAt: group.starts_at }, now, t)) throw notFound();
      // The show as the member's own plan saw it: the same snapshot the plan shows.
      const plan = getPlan(app.db, mine.plan_id);
      if (plan === null) throw notFound();
      const size = groupSize(app.db, group.id);
      const before = {
        state: group.state as "confirmed" | "locked" | "live" | "done",
        size,
        belowPlan: belowPlan(size, t),
        revealAt: revealAt(group.starts_at, t),
        meetAt: group.meet_at ?? meetAt(group.starts_at, t),
        showSnapshot: { title: plan.show_title, startsAt: group.starts_at, venueName: plan.venue_name },
      };
      // Before T-3h the answer holds no co-member, no ref, no photo and no cafe: nothing has been looked up yet.
      if (!canReveal({ startsAt: group.starts_at, state: group.state }, now, t)) return ok(before satisfies GroupResponse);
      const cafe: Cafe =
        group.cafe_name === null
          ? { name: plan.venue_name, address: null, lat: plan.venue_lat, lng: plan.venue_lng, isFallback: true }
          : { name: group.cafe_name, address: group.cafe_address, lat: group.cafe_lat, lng: group.cafe_lng, isFallback: false };
      const members = revealedMembers(app.db, group.id, row.id).map((m) => ({
        memberRef: m.memberRef,
        firstName: m.firstName,
        photoUrl: m.photoKey === null ? null : app.store.linkFor(m.photoKey),
        checkedIn: m.checkedIn,
        isYou: m.isYou,
      }));
      const feedback =
        group.state === "done"
          ? {
              feedbackOpenUntil: milestones(group.starts_at, t).feedbackClosesAt,
              downvotedRefs: downvotedRefs(app.db, group.id, row.id),
            }
          : {};
      return ok({ ...before, cafe, members, ...feedback } satisfies GroupResponse);
    },
  },
  {
    method: "GET",
    pattern: "/groups/:groupId/members/:memberRef/photo",
    auth: "member",
    handler: ({ app, params, member, now }) => {
      const { member: row } = authed(member);
      const t = app.config.tunables;
      const found = getGroupForMember(app.db, params.groupId as string, row.id);
      if (found === null || !canReveal({ startsAt: found.group.starts_at, state: found.group.state }, now, t)) throw notFound();
      const key = memberPhotoKey(app.db, found.group.id, params.memberRef as string);
      if (key === null) throw notFound();
      return ok({ photo: fileLink(app, key, now) } satisfies MemberPhotoResponse);
    },
  },
  {
    method: "POST",
    pattern: "/groups/:groupId/checkin",
    auth: "member",
    handler: async ({ app, request, params, member, now }) => {
      const { member: row } = authed(member);
      // No coordinates and no body: checking in says "I am here", never where.
      await parseEmptyBody(request, checkinRequestSchema);
      const result = checkIn(app.db, params.groupId as string, row.id, now, app.config.tunables);
      if (!result.ok) {
        if (result.error === "not_found") throw notFound();
        throw new AppError(409, "outside_window", "check-in is open from 90 minutes before the show to an hour after it starts");
      }
      return ok({ checkedIn: true } satisfies CheckinResponse);
    },
  },
];
