import { z } from "zod";
import { matchableItemSchema } from "./me.js";

/**
 * Every app API error is `{ error: { code, message } }`. `code` is a stable snake_case string
 * the app switches on; `message` is for logs and is never shown as is. The list of codes grows
 * with the endpoints (M2 onward). Two codes carry one extra field the app needs to act on them:
 * `not_matchable` lists what the member still has to add, and `plan_exists` names the plan to carry on with.
 */
export const errorBodySchema = z.object({
  error: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
    message: z.string(),
    missing: z.array(matchableItemSchema).optional(),
    planId: z.string().optional(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;

/**
 * The codes the server sends. A code is added here in the commit that first sends it, so the app can
 * switch on the list and a test can fail on a code the server invents.
 */
export const ERROR_CODES = [
  // Every endpoint.
  "invalid_request",
  "unauthorized",
  "not_found",
  "method_not_allowed",
  "rate_limited",
  "payload_too_large",
  "server_error",
  // Sign-in and sessions.
  "bad_phone",
  "sign_in_unavailable",
  "otp_cap_reached",
  "otp_send_failed",
  "invalid_code",
  "unknown_notice_version",
  "account_suspended",
  // Profile, handle and photo.
  "women_only",
  "bad_handle",
  "handle_locked",
  "profile_locked",
  "file_too_large",
  "unsupported_type",
  // Plans, tickets, groups and check-in.
  "plan_exists",
  "not_matchable",
  "plan_closed",
  "too_late",
  "screenshot_required",
  "bad_ticket",
  "outside_window",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;
