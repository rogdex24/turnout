import { createHmac, timingSafeEqual } from "node:crypto";
import type { Clock } from "../utils/clock.js";
import { isValidKey } from "../utils/objectStore.js";

/** Where signed file links point. The files route in the app API serves them. */
export const FILE_LINK_PATH = "/api/app/v1/files/";

/** What gets signed: the key and the expiry, so changing either one breaks the link. Tagged "app" so it is never the same as an admin link's signature. */
function signature(secret: string, key: string, expiresAtSeconds: number): string {
  return createHmac("sha256", secret).update(`app\n${key}\n${expiresAtSeconds}`).digest("base64url");
}

/** A short-lived link to one stored file. `ttlSeconds` counts from `now`. */
export function signFileLink(secret: string, key: string, now: Date, ttlSeconds: number): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${FILE_LINK_PATH}${path}?exp=${exp}&sig=${signature(secret, key, exp)}`;
}

/** True when the signature matches this key and expiry and the link has not expired. Constant time on the signature. */
export function verifyFileLink(secret: string, key: string, exp: string | null, sig: string | null, now: Date): boolean {
  if (exp === null || sig === null || !/^\d{1,12}$/.test(exp)) return false;
  const expiresAt = Number(exp);
  const expected = Buffer.from(signature(secret, key, expiresAt));
  const given = Buffer.from(sig);
  // timingSafeEqual throws on different lengths; a length mismatch is already a bad signature.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return now.getTime() < expiresAt * 1000;
}

/** The key out of a files-route path, or null when the path is not one or the key is unsafe. */
export function keyFromFilePath(pathname: string): string | null {
  if (!pathname.startsWith(FILE_LINK_PATH)) return null;
  let key: string;
  try {
    key = pathname
      .slice(FILE_LINK_PATH.length)
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    return null;
  }
  return isValidKey(key) ? key : null;
}

/** The `link` a disk or memory store needs: a signed link to the files route, good for `ttlSeconds`. */
export function signedLinker(secret: string, ttlSeconds: number, now: Clock): (key: string) => string {
  return (key) => signFileLink(secret, key, now(), ttlSeconds);
}
