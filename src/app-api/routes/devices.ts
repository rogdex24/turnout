import { type RegisterDeviceResponse, registerDeviceRequestSchema } from "@turnout/contract/app/devices";
import { registerDevice, removeDevice } from "../../social/devices.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { notFound } from "../errors.js";
import { ok, parseBody } from "../http.js";
import { enforce } from "../rateLimit.js";

export const deviceRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/devices",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row, sessionId } = authed(member);
      enforce(app.db, app.config.otpPepper, "device:register", row.id, app.config.tunables.rate.deviceRegisterPerMemberHour, now);
      const input = await parseBody(request, registerDeviceRequestSchema);
      const device = registerDevice(app.db, { memberId: row.id, sessionId, expoToken: input.expoPushToken, platform: input.platform, now });
      return ok({ deviceId: device.id } satisfies RegisterDeviceResponse);
    },
  },
  {
    method: "DELETE",
    pattern: "/devices/:deviceId",
    auth: "member",
    handler: ({ app, params, member }) => {
      // Someone else's device and a device that does not exist are the same 404.
      if (!removeDevice(app.db, authed(member).member.id, params.deviceId as string)) throw notFound();
      return new Response(null, { status: 204 });
    },
  },
];
