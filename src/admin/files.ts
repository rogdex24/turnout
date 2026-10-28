import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { diskStore, type ObjectStore, type S3Config, s3Store } from "../utils/objectStore.js";

/** How long an operator's link to a ticket or a photo works. */
export const ADMIN_LINK_SECONDS = 5 * 60;

/** The stored files the admin can open, and the secret that signs its links to them. */
export interface AdminFiles {
  store: ObjectStore;
  secret: string;
  ttlSeconds: number;
}

const signature = (secret: string, pathname: string, expiresAtSeconds: number): string =>
  createHmac("sha256", secret).update(`${pathname}\n${expiresAtSeconds}`).digest("base64url");

/**
 * A link to one admin file route. A browser tab cannot send the bearer token, so the link carries its own proof: the path and the expiry
 * are signed with FILE_LINK_SECRET, and changing either breaks it.
 */
export function signAdminLink(files: AdminFiles, pathname: string, now: Date): string {
  const exp = Math.floor(now.getTime() / 1000) + files.ttlSeconds;
  return `${pathname}?exp=${exp}&sig=${signature(files.secret, pathname, exp)}`;
}

/** True when the signature matches this path and expiry and the link has not expired. Constant time on the signature. */
export function verifyAdminLink(files: AdminFiles, pathname: string, params: URLSearchParams, now: Date): boolean {
  const exp = params.get("exp");
  const sig = params.get("sig");
  if (exp === null || sig === null || !/^\d{1,12}$/.test(exp)) return false;
  const expected = Buffer.from(signature(files.secret, pathname, Number(exp)));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return now.getTime() < Number(exp) * 1000;
}

const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;

/**
 * The same files the app API writes, read with the same settings (OBJECT_STORE, FILES_DIR, S3_*). Without FILE_LINK_SECRET, or with
 * the in-memory store (a test or staging fake that another process cannot see), the admin shows no file links.
 */
export function adminFilesFromEnv(env: Record<string, string | undefined>): AdminFiles | null {
  const secret = clean(env.FILE_LINK_SECRET);
  if (secret === undefined) return null;
  const kind = clean(env.OBJECT_STORE) ?? "disk";
  const ttlSeconds = ADMIN_LINK_SECONDS;
  if (kind === "disk") {
    return { store: diskStore({ dir: path.resolve(clean(env.FILES_DIR) ?? "data/files"), link: (key) => key }), secret, ttlSeconds };
  }
  if (kind === "s3") {
    const bucket = clean(env.S3_BUCKET);
    const accessKeyId = clean(env.S3_ACCESS_KEY_ID);
    const secretAccessKey = clean(env.S3_SECRET_ACCESS_KEY);
    if (bucket === undefined || accessKeyId === undefined || secretAccessKey === undefined) return null;
    const config: S3Config = { bucket, accessKeyId, secretAccessKey, endpoint: clean(env.S3_ENDPOINT), region: clean(env.S3_REGION) };
    return { store: s3Store(config, { ttlSeconds }), secret, ttlSeconds };
  }
  return null;
}
