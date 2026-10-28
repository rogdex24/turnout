import { otpRequestSchema, otpVerifyRequestSchema, refreshRequestSchema } from "@turnout/contract/app/auth";
import { revokeSession } from "../../social/sessions.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { notFound } from "../errors.js";
import { ok, parseBody } from "../http.js";
import { challengeDeliveryStatus, requestOtp, verifyOtp } from "../otp.js";
import { refreshSession } from "../sessions.js";

export const authRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/auth/otp",
    auth: "none",
    handler: async ({ app, request, ip, now }) => ok(await requestOtp(app, await parseBody(request, otpRequestSchema), ip, now)),
  },
  {
    method: "GET",
    pattern: "/auth/otp/:challengeId",
    auth: "none",
    handler: ({ app, params, now }) => {
      const deliveryStatus = challengeDeliveryStatus(app, params.challengeId as string, now);
      if (deliveryStatus === null) throw notFound();
      return ok({ deliveryStatus });
    },
  },
  {
    method: "POST",
    pattern: "/auth/otp/verify",
    auth: "none",
    handler: async ({ app, request, now }) => ok(await verifyOtp(app, await parseBody(request, otpVerifyRequestSchema), now)),
  },
  {
    method: "POST",
    pattern: "/auth/refresh",
    auth: "none",
    handler: async ({ app, request, now }) =>
      ok(await refreshSession(app, (await parseBody(request, refreshRequestSchema)).refreshToken, now)),
  },
  {
    method: "POST",
    pattern: "/auth/sign-out",
    auth: "member",
    handler: ({ app, member, now }) => {
      revokeSession(app.db, authed(member).sessionId, now);
      return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });
    },
  },
];
