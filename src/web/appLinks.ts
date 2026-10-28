import { jsonResponse } from "./api.js";

/**
 * The files that let a phone confirm that `go.<host>` links belong to the app. The values come from the host environment, and a
 * file that is not fully set is a 404, so a half-set deploy never publishes a statement that names the wrong key.
 */
export interface AppLinksConfig {
  androidPackage: string | null;
  /** Upper-case, colon-separated SHA-256 fingerprints of the signing certificates (the Play App Signing key, and the upload key if wanted). */
  androidSha256: readonly string[];
  /** `<team id>.<bundle id>`, the team id being 10 upper-case letters or digits. Empty until the Apple account exists. */
  iosAppIds: readonly string[];
  /** The `go.<domain>` host that app links and the website's "Go with a group" link use. Null until the domain is decided. */
  host: string | null;
  /** The app's Google Play page. Null while the app is only in a closed test, so the fallback page says it is in testing. */
  playStoreUrl: string | null;
}

type Env = Record<string, string | undefined>;

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FINGERPRINT = /^[0-9A-F]{64}$/;
const IOS_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A fingerprint written with or without colons, in either case, as the colon form Android expects. Null when it is not 32 bytes of hex. */
function normalizeFingerprint(raw: string): string | null {
  const bare = raw.replaceAll(":", "").toUpperCase();
  return FINGERPRINT.test(bare) ? (bare.match(/../g) as string[]).join(":") : null;
}

/** A host written in any case, as the lower-case name a URL carries. Null when it is not a dotted host name (no scheme, path or port). */
function normalizeHost(raw: string | undefined): string | null {
  const host = (raw ?? "").trim().toLowerCase();
  return HOST.test(host) ? host : null;
}

/** An https link to the app's page on Google Play. Anything else (another host, plain http, a credential in the URL) is dropped. */
function normalizePlayUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  try {
    const url = new URL(value);
    const ok = url.protocol === "https:" && url.hostname === "play.google.com" && url.username === "" && url.password === "";
    return ok ? url.href : null;
  } catch {
    return null;
  }
}

export function appLinksFromEnv(env: Env): AppLinksConfig {
  const androidPackage = env.APP_LINKS_ANDROID_PACKAGE?.trim() ?? "";
  const fingerprints = list(env.APP_LINKS_ANDROID_SHA256).flatMap((raw) => normalizeFingerprint(raw) ?? []);
  return {
    androidPackage: PACKAGE.test(androidPackage) ? androidPackage : null,
    androidSha256: [...new Set(fingerprints)],
    iosAppIds: list(env.APP_LINKS_IOS_APP_IDS).filter((id) => IOS_APP_ID.test(id)),
    host: normalizeHost(env.APP_LINKS_HOST),
    playStoreUrl: normalizePlayUrl(env.PLAY_STORE_URL),
  };
}

/** The app link variables that are set but hold a value `appLinksFromEnv` drops, so `serve` can say why a file is a 404. */
export function rejectedAppLinkVars(env: Env): string[] {
  const rejected: string[] = [];
  const androidPackage = env.APP_LINKS_ANDROID_PACKAGE?.trim() ?? "";
  if (androidPackage !== "" && !PACKAGE.test(androidPackage)) rejected.push("APP_LINKS_ANDROID_PACKAGE");
  if (list(env.APP_LINKS_ANDROID_SHA256).some((raw) => normalizeFingerprint(raw) === null)) rejected.push("APP_LINKS_ANDROID_SHA256");
  if (list(env.APP_LINKS_IOS_APP_IDS).some((id) => !IOS_APP_ID.test(id))) rejected.push("APP_LINKS_IOS_APP_IDS");
  if ((env.APP_LINKS_HOST?.trim() ?? "") !== "" && normalizeHost(env.APP_LINKS_HOST) === null) rejected.push("APP_LINKS_HOST");
  if ((env.PLAY_STORE_URL?.trim() ?? "") !== "" && normalizePlayUrl(env.PLAY_STORE_URL) === null) rejected.push("PLAY_STORE_URL");
  return rejected;
}

/** The link that opens a show's group sheet: the app when it is installed, the website's fallback page when it is not. Null without a host. */
export function goWithGroupLink(config: AppLinksConfig | undefined, publicId: string): string | null {
  return config?.host ? `https://${config.host}/e/${encodeURIComponent(publicId)}/go?src=web` : null;
}

function publicJson(body: unknown): Response {
  const response = jsonResponse(body);
  response.headers.set("cache-control", "public, max-age=3600");
  return response;
}

/** `/.well-known/assetlinks.json`: 200 with no redirect, or null (the site's 404) when the package or the fingerprints are not set. */
export function assetlinksResponse(config: AppLinksConfig | undefined): Response | null {
  if (!config?.androidPackage || config.androidSha256.length === 0) return null;
  return publicJson([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: config.androidPackage, sha256_cert_fingerprints: config.androidSha256 },
    },
  ]);
}

/** `/.well-known/apple-app-site-association`: null (404) until `APP_LINKS_IOS_APP_IDS` exists. */
export function aasaResponse(config: AppLinksConfig | undefined): Response | null {
  if (!config || config.iosAppIds.length === 0) return null;
  return publicJson({ applinks: { details: [{ appIDs: config.iosAppIds, components: [{ "/": "/e/*" }] }] } });
}
