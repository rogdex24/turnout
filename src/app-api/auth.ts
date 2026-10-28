import { getMember } from "../social/members.js";
import { getSession } from "../social/sessions.js";
import type { AuthedMember, RequestContext } from "./context.js";
import { AppError, unauthorized } from "./errors.js";
import { verifyAccessToken } from "./tokens.js";

/**
 * Runs before every member route. The token must be a good access token, its session must still be open and belong to the
 * member, and the member must be allowed in: banned and deleted get 401, suspended get 403 even if the session was revoked by the suspension, stopped is fine (they may still
 * sign in and see their data). Checked on every request, so a ban or a sign-out takes effect at once, not when the token expires.
 */
export async function requireMember(context: Pick<RequestContext, "app" | "request" | "now">): Promise<AuthedMember> {
  const header = context.request.headers.get("authorization");
  const match = header === null ? null : /^Bearer ([A-Za-z0-9._-]{20,4000})$/.exec(header);
  if (match === null) throw unauthorized();
  const claims = await verifyAccessToken(context.app.config, match[1] as string, context.now);
  if (claims === null) throw unauthorized();
  const session = getSession(context.app.db, claims.sessionId);
  if (session === null || session.member_id !== claims.memberId) throw unauthorized();
  const member = getMember(context.app.db, claims.memberId);
  if (member === null || member.deleted_at !== null || member.status === "banned" || member.status === "deleted") throw unauthorized();
  // A suspension signs the member out everywhere, so their next call with the token they hold is told why (403) and not just 401.
  if (member.status === "suspended") throw new AppError(403, "account_suspended", "this account is suspended");
  if (session.revoked_at !== null) throw unauthorized();
  return { member, sessionId: session.id };
}

/** The member a `auth: "member"` route runs for. The pipeline sets it before the handler, so null here means a route was wired wrong. */
export function authed(member: AuthedMember | null): AuthedMember {
  if (member === null) throw unauthorized();
  return member;
}
