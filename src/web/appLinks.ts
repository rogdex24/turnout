import { jsonResponse } from "./api.js";

/**
 * The files that let a phone confirm that `go.<host>` links belong to the app. The values come from the host environment, and a
 * file that is not fully set is a 404, so a half-set deploy never publishes a statement that names the wrong key.
 */
export interface AppLinksConfig {
  androidPackage: string | null;
  /** Upper-case, colon-separated SHA-256 fingerprints of the signing certificates (the Play App Signing key, and the upload key if wanted). */
  androidSha256: readonly string[];
  /** `<team id>.<bundle id>`. Empty until the Apple account exists. */
  iosAppIds: readonly string[];
}

type Env = Record<string, string | undefined>;

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FINGERPRINT = /^[0-9A-F]{64}$/;

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

export function appLinksFromEnv(env: Env): AppLinksConfig {
  const androidPackage = env.APP_LINKS_ANDROID_PACKAGE?.trim() ?? "";
  const fingerprints = list(env.APP_LINKS_ANDROID_SHA256).flatMap((raw) => normalizeFingerprint(raw) ?? []);
  return {
    androidPackage: PACKAGE.test(androidPackage) ? androidPackage : null,
    androidSha256: [...new Set(fingerprints)],
    iosAppIds: list(env.APP_LINKS_IOS_APP_IDS),
  };
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
