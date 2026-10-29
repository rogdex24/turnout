import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizePhone } from "../../social/model/phone.js";
import type { Route } from "../context.js";
import { invalidRequest, notFound } from "../errors.js";
import { ok, parseBody } from "../http.js";
import { clearLimits } from "../rateLimit.js";
import { runTickerPass } from "../ticker.js";
import type { FakeOtpSender } from "../vendors/otpSender.js";

const otpBody = z.object({ phone: z.string().min(5).max(20) }).strict();

const clockBody = z
  .object({
    /** Jump so the server's clock reads this ISO time right now. */
    set: z.iso.datetime().optional(),
    advanceMs: z
      .number()
      .int()
      .min(0)
      .max(366 * 24 * 60 * 60 * 1000)
      .optional(),
    reset: z.literal(true).optional(),
    /** Run one ticker pass after the clock moved, so a test sees the locks, the reveals and the pushes without waiting. */
    tick: z.literal(true).optional(),
  })
  .strict();

export const TEST_TOKEN_HEADER = "x-staging-test-token";

function tokenMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Routes for the end-to-end tests on a staging server: read the last sign-in code for a number (no WhatsApp in staging), move
 * the server's clock and empty the rate limits. They exist only outside production, only with `STAGING_TEST_TOKEN` set, and answer 404 without it.
 * `appRoutes` leaves them out of the route table in production, so there is nothing to find.
 */
export const testOnlyRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/__test/otp",
    auth: "none",
    handler: async ({ app, request }) => {
      const token = app.config.stagingTestToken;
      if (token === null || !tokenMatches(request.headers.get(TEST_TOKEN_HEADER), token)) throw notFound();
      const { phone } = await parseBody(request, otpBody);
      const e164 = normalizePhone(phone, app.config.phoneAllowlist);
      if (e164 === null) throw invalidRequest("phone: not a number this server accepts");
      const sender = app.sender as Partial<FakeOtpSender>;
      if (typeof sender.lastCode !== "function") throw notFound();
      const reviewer = app.config.reviewer?.phone === e164 ? app.config.reviewer.code : null;
      const code = reviewer ?? sender.lastCode(e164);
      if (code === null) throw notFound();
      return ok({ code });
    },
  },
  {
    method: "POST",
    pattern: "/__test/clock",
    auth: "none",
    handler: async ({ app, request }) => {
      const token = app.config.stagingTestToken;
      if (token === null || !tokenMatches(request.headers.get(TEST_TOKEN_HEADER), token) || app.adjustClock === undefined) throw notFound();
      const body = await parseBody(request, clockBody);
      if (body.reset) app.adjustClock.reset();
      if (body.set !== undefined) app.adjustClock.set(body.set);
      if (body.advanceMs !== undefined) app.adjustClock.advance(body.advanceMs);
      if (body.tick) await runTickerPass(app, "test-clock");
      return ok({ now: app.adjustClock().toISOString() });
    },
  },
  {
    method: "POST",
    pattern: "/__test/limits",
    auth: "none",
    // The device job runs the flows a second time on the same server when the first run fails, and the sign-in flows would then
    // hit the per phone limit. Each run starts by emptying the limits.
    handler: async ({ app, request }) => {
      const token = app.config.stagingTestToken;
      if (token === null || !tokenMatches(request.headers.get(TEST_TOKEN_HEADER), token)) throw notFound();
      clearLimits(app.db);
      return ok({});
    },
  },
];
