import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizePhone } from "../../social/model/phone.js";
import type { Route } from "../context.js";
import { invalidRequest, notFound } from "../errors.js";
import { ok, parseBody, readBytes } from "../http.js";
import { sinkFor } from "../posthogSink.js";
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

/** The most a capture post may hold, as sent (the sink caps it again once unzipped). */
const CAPTURE_MAX_BYTES = 256 * 1024;
/** The longest a read of the captured events may hold the request open, waiting for the events a flow expects. */
const EVENTS_MAX_WAIT_MS = 8000;

function requireToken(app: { config: { stagingTestToken: string | null } }, request: Request): void {
  const token = app.config.stagingTestToken;
  if (token === null || !tokenMatches(request.headers.get(TEST_TOKEN_HEADER), token)) throw notFound();
}

/**
 * Routes for the end-to-end tests on a staging server: read the last sign-in code for a number (no WhatsApp in staging), move
 * the server's clock, empty the rate limits and keep the analytics events the e2e build sends. They exist only outside production, only with `STAGING_TEST_TOKEN` set, and answer 404 without it.
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
  // A stand-in for PostHog in the e2e build, whose host is this path (the SDK adds `/batch/`). The app cannot send the test token, which
  // is new for every run, so a post is taken on the build's own project key instead (see E2E_POSTHOG_KEY) and only these routes' existence
  // depends on the token. Reading and emptying what was kept need the token like every other route here.
  ...["batch", "capture", "e"].map(
    (name): Route => ({
      method: "POST",
      pattern: `/__test/posthog/${name}`,
      auth: "none",
      handler: async ({ app, request, now }) => {
        const body = await readBytes(request, CAPTURE_MAX_BYTES);
        sinkFor(app).ingest(body, request.headers.get("content-encoding"), now);
        return ok({ status: 1 });
      },
    }),
  ),
  {
    method: "GET",
    pattern: "/__test/posthog/events",
    auth: "none",
    // `until` is a comma list of event names; the answer comes as soon as they have all arrived in that order, or after `waitMs`
    // (the SDK sends in batches every 10 s). `matched` says which.
    handler: async ({ app, request, url }) => {
      requireToken(app, request);
      const until = (url.searchParams.get("until") ?? "").split(",").filter(Boolean);
      const waitMs = Math.min(Math.max(Number(url.searchParams.get("waitMs") ?? 0) || 0, 0), EVENTS_MAX_WAIT_MS);
      const { events, matched } = await sinkFor(app).waitFor(until, waitMs);
      return ok({ events, matched });
    },
  },
  {
    method: "POST",
    pattern: "/__test/posthog/reset",
    auth: "none",
    handler: async ({ app, request }) => {
      requireToken(app, request);
      sinkFor(app).clear();
      return ok({});
    },
  },
];
