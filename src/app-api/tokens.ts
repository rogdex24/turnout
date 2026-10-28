import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import { addDays, addMinutes } from "../social/dates.js";
import type { AppConfig } from "./env.js";

const ISSUER = "turnout";
const AUDIENCE = "turnout-app";

export interface AccessClaims {
  memberId: string;
  sessionId: string;
}

/** A 15 minute ES256 access token: `sub` is the member, `sid` the session. */
export async function signAccessToken(config: AppConfig, claims: AccessClaims, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = addMinutes(now, config.tunables.session.accessMinutes);
  const token = await new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: "ES256", kid: config.jwt.kid })
    .setSubject(claims.memberId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(config.jwt.privateKey);
  return { token, expiresAt };
}

/**
 * The claims of a good access token, or null. A token signed by the previous key is accepted while that key is configured
 * (a key change does not sign everyone out); any other failure, including expiry, is null.
 */
export async function verifyAccessToken(config: AppConfig, token: string, now: Date): Promise<AccessClaims | null> {
  const options = { algorithms: ["ES256"], issuer: ISSUER, audience: AUDIENCE, currentDate: now };
  const keys = [config.jwt.publicKey, ...(config.jwt.previousPublicKey ? [config.jwt.previousPublicKey] : [])];
  for (const key of keys) {
    try {
      const { payload } = await jwtVerify(token, key, options);
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
      return { memberId: payload.sub, sessionId: payload.sid };
    } catch (error) {
      // Only a signature failure is worth trying the older key for.
      if (!(error instanceof errors.JWSSignatureVerificationFailed)) return null;
    }
  }
  return null;
}

/** 32 random bytes, base64url. The caller keeps `hash` and hands `token` to the app once. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshExpiry(config: AppConfig, now: Date): Date {
  return addDays(now, config.tunables.session.refreshDays);
}
