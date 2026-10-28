import type { TokenPair } from "@turnout/contract/app/auth";
import { getMember } from "../social/members.js";
import { getSessionByRefreshHash, insertSession, revokeAllSessions, revokeSession, rotateSession } from "../social/sessions.js";
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
 */
export async function refreshSession(app: AppContext, refreshToken: string, now: Date): Promise<TokenPair> {
  const row = getSessionByRefreshHash(app.db, hashRefreshToken(refreshToken));
  if (row === null) throw unauthorized();
  if (row.replaced_at !== null) {
    revokeAllSessions(app.db, row.member_id, now);
    throw unauthorized();
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
