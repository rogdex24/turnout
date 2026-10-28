import type { TokenPair } from "@turnout/contract/app/auth";
import { getMember } from "../social/members.js";
import { getSession, getSessionByRefreshHash, insertSession, revokeAllSessions, revokeSession, rotateSession } from "../social/sessions.js";
import { ulid } from "../utils/ulid.js";
import type { AppContext } from "./context.js";
import { unauthorized } from "./errors.js";
import { hashRefreshToken, newRefreshToken, refreshExpiry, signAccessToken } from "./tokens.js";

async function tokenPair(app: AppContext, memberId: string, sessionId: string, refreshToken: string, now: Date): Promise<TokenPair> {
  const access = await signAccessToken(app.config, { memberId, sessionId }, now);
  return {
    accessToken: access.token,
    accessExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshExpiresAt: refreshExpiry(app.config, now).toISOString(),
  };
}

/** Starts a session for a member who just proved their phone. */
export async function openSession(app: AppContext, memberId: string, now: Date): Promise<TokenPair> {
  const refresh = newRefreshToken();
  const id = ulid(now);
  insertSession(app.db, { id, memberId, refreshHash: refresh.hash, now, refreshDays: app.config.tunables.session.refreshDays });
  return tokenPair(app, memberId, id, refresh.token, now);
}

/**
 * Trades a refresh token for a new pair. The old token stops working. A token that was already traded in is a stolen or replayed
 * one, so it signs the member out everywhere. The 30 days start again at each refresh.
 *
 * One exception: a phone that lost the response to a refresh sends the same token again. Inside a short grace window, while the
 * replacement it never saw is still unused, that repeat rotates the chain once more (the replacement is revoked and a fresh pair
 * is issued) instead of signing everyone out. Outside the window, or once the replacement was used, it is reuse as before.
 */
export async function refreshSession(app: AppContext, refreshToken: string, now: Date): Promise<TokenPair> {
  const presented = getSessionByRefreshHash(app.db, hashRefreshToken(refreshToken));
  if (presented === null) throw unauthorized();
  let row = presented;
  if (presented.replaced_at !== null) {
    const replacement = presented.replaced_by === null ? null : getSession(app.db, presented.replaced_by);
    const graceMs = app.config.tunables.session.refreshGraceSeconds * 1000;
    const inGrace = now.getTime() - new Date(presented.replaced_at).getTime() < graceMs;
    if (replacement === null || !inGrace || replacement.replaced_at !== null || replacement.revoked_at !== null) {
      revokeAllSessions(app.db, presented.member_id, now);
      throw unauthorized();
    }
    row = replacement;
  }
  if (row.revoked_at !== null || new Date(row.expires_at).getTime() <= now.getTime()) throw unauthorized();
  const member = getMember(app.db, row.member_id);
  if (member === null || member.deleted_at !== null || member.status === "banned" || member.status === "deleted") {
    revokeSession(app.db, row.id, now);
    throw unauthorized();
  }
  const next = newRefreshToken();
  const id = ulid(now);
  const rotated = rotateSession(app.db, {
    oldId: row.id,
    id,
    memberId: row.member_id,
    refreshHash: next.hash,
    now,
    refreshDays: app.config.tunables.session.refreshDays,
  });
  if (!rotated) {
    // Two requests used the same token at once: only one can win, and the other looks like a replay.
    revokeAllSessions(app.db, row.member_id, now);
    throw unauthorized();
  }
  return tokenPair(app, row.member_id, id, next.token, now);
}
