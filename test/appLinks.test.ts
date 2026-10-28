import { describe, expect, test } from "bun:test";
import { appLinksFromEnv } from "../src/web/appLinks.js";
import { siteResponse } from "../src/web/index.js";
import { memoryDb } from "./helpers.js";

// Sample fingerprints, not a real signing key.
const FP_A = Array.from({ length: 32 }, (_, i) => (i * 7 + 1).toString(16).padStart(2, "0").toUpperCase()).join(":");
const FP_B = Array.from({ length: 32 }, (_, i) => (255 - i).toString(16).padStart(2, "0").toUpperCase()).join(":");
const PACKAGE = "app.example.turnout";

const db = memoryDb();
const get = (path: string, options?: Parameters<typeof siteResponse>[3]) =>
  siteResponse(db, new Request(`https://go.example.com${path}`), undefined, options) as Response;
const configured = { appLinks: appLinksFromEnv({ APP_LINKS_ANDROID_PACKAGE: PACKAGE, APP_LINKS_ANDROID_SHA256: FP_A }) };

describe("appLinksFromEnv", () => {
  test("nothing is set", () => {
    expect(appLinksFromEnv({})).toEqual({ androidPackage: null, androidSha256: [], iosAppIds: [] });
  });

  test("a comma list is split, trimmed, upper-cased, colon-formatted and de-duplicated", () => {
    const bare = FP_B.replaceAll(":", "").toLowerCase();
    const config = appLinksFromEnv({
      APP_LINKS_ANDROID_PACKAGE: PACKAGE,
      APP_LINKS_ANDROID_SHA256: ` ${FP_A.toLowerCase()} , ${bare},${FP_A}`,
    });
    expect(config.androidSha256).toEqual([FP_A, FP_B]);
  });

  test("a malformed fingerprint or package is dropped, never passed on", () => {
    const config = appLinksFromEnv({ APP_LINKS_ANDROID_PACKAGE: "not a package", APP_LINKS_ANDROID_SHA256: `${FP_A},ZZ:11,${FP_A}:00` });
    expect(config.androidPackage).toBeNull();
    expect(config.androidSha256).toEqual([FP_A]);
  });

  test("iOS app ids are a trimmed comma list", () => {
    expect(appLinksFromEnv({ APP_LINKS_IOS_APP_IDS: " TEAM12345.app.example.turnout , " }).iosAppIds).toEqual([
      "TEAM12345.app.example.turnout",
    ]);
  });
});

describe("/.well-known/assetlinks.json", () => {
  test("is 200 JSON in the shape Android checks, with no redirect", async () => {
    const response = get("/.well-known/assetlinks.json", configured);
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(false);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: [FP_A] },
      },
    ]);
  });

  test("lists every fingerprint from the comma list", async () => {
    const appLinks = appLinksFromEnv({ APP_LINKS_ANDROID_PACKAGE: PACKAGE, APP_LINKS_ANDROID_SHA256: `${FP_A},${FP_B}` });
    const body = (await get("/.well-known/assetlinks.json", { appLinks }).json()) as { target: { sha256_cert_fingerprints: string[] } }[];
    expect(body[0]?.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B]);
  });

  test("is 404 when nothing is configured", () => {
    expect(get("/.well-known/assetlinks.json").status).toBe(404);
    expect(get("/.well-known/assetlinks.json", { appLinks: appLinksFromEnv({}) }).status).toBe(404);
  });

  test("is 404 when only the package or only the fingerprint is set", () => {
    const onlyPackage = appLinksFromEnv({ APP_LINKS_ANDROID_PACKAGE: PACKAGE });
    const onlyFingerprint = appLinksFromEnv({ APP_LINKS_ANDROID_SHA256: FP_A });
    expect(get("/.well-known/assetlinks.json", { appLinks: onlyPackage }).status).toBe(404);
    expect(get("/.well-known/assetlinks.json", { appLinks: onlyFingerprint }).status).toBe(404);
  });

  test("lives at the one exact path, not a trailing-slash or nested form", () => {
    expect(get("/.well-known/assetlinks.json/", configured).status).toBe(404);
    expect(get("/.well-known/assetlinks.json/x", configured).status).toBe(404);
    expect(get("/assetlinks.json", configured).status).toBe(404);
  });
});

describe("/.well-known/apple-app-site-association", () => {
  test("is 404 until an iOS app id exists, even with the Android values set", () => {
    expect(get("/.well-known/apple-app-site-association", configured).status).toBe(404);
    expect(get("/.well-known/apple-app-site-association").status).toBe(404);
  });

  test("answers 200 JSON for the app ids once they are set", async () => {
    const appLinks = appLinksFromEnv({ APP_LINKS_IOS_APP_IDS: "TEAM12345.app.example.turnout" });
    const response = get("/.well-known/apple-app-site-association", { appLinks });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      applinks: { details: [{ appIDs: ["TEAM12345.app.example.turnout"], components: [{ "/": "/e/*" }] }] },
    });
  });
});
