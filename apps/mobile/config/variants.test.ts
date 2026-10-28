import {
  assertReleaseEnv,
  DEFAULT_DEV_PORT,
  DEFAULT_E2E_PORT,
  parseVariant,
  resolveApiUrls,
  resolveMapsKey,
  VARIANT_CONFIG,
  VARIANTS,
} from "./variants";

describe("parseVariant", () => {
  test("defaults to development and rejects unknown names", () => {
    expect(parseVariant(undefined)).toBe("development");
    expect(parseVariant("")).toBe("development");
    expect(parseVariant("e2e")).toBe("e2e");
    expect(() => parseVariant("staging")).toThrow("APP_VARIANT");
  });
});

describe("variant identity", () => {
  test("bundle ids and schemes follow the plan and never collide", () => {
    expect(VARIANT_CONFIG.development.bundleId).toBe("com.turnout.app.dev");
    expect(VARIANT_CONFIG.e2e.bundleId).toBe("com.turnout.app.e2e");
    expect(VARIANT_CONFIG.preview.bundleId).toBe("com.turnout.app.preview");
    expect(VARIANT_CONFIG.production.bundleId).toBe("com.turnout.app");
    expect(VARIANT_CONFIG.e2e.scheme).toBe("turnout-e2e");
    expect(new Set(VARIANTS.map((v) => VARIANT_CONFIG[v].bundleId)).size).toBe(VARIANTS.length);
    expect(new Set(VARIANTS.map((v) => VARIANT_CONFIG[v].scheme)).size).toBe(VARIANTS.length);
  });

  test("Storybook is in development and e2e only", () => {
    expect(VARIANTS.filter((v) => VARIANT_CONFIG[v].storybook)).toEqual(["development", "e2e"]);
  });
});

describe("resolveApiUrls", () => {
  test("e2e reaches the host at 10.0.2.2 on Android and localhost on iOS", () => {
    expect(resolveApiUrls("e2e", { E2E_API_PORT: "4100" })).toEqual({ android: "http://10.0.2.2:4100", ios: "http://localhost:4100" });
    expect(resolveApiUrls("e2e", {}).android).toBe(`http://10.0.2.2:${DEFAULT_E2E_PORT}`);
  });

  test("development uses the server's own port", () => {
    expect(resolveApiUrls("development", {})).toEqual({
      android: `http://10.0.2.2:${DEFAULT_DEV_PORT}`,
      ios: `http://localhost:${DEFAULT_DEV_PORT}`,
    });
  });

  test("EXPO_PUBLIC_API_URL wins everywhere", () => {
    expect(resolveApiUrls("development", { EXPO_PUBLIC_API_URL: "http://192.0.2.7:3000" })).toEqual({
      android: "http://192.0.2.7:3000",
      ios: "http://192.0.2.7:3000",
    });
  });

  test("preview and production throw without one", () => {
    expect(() => resolveApiUrls("preview", {})).toThrow("EXPO_PUBLIC_API_URL");
    expect(() => resolveApiUrls("production", {})).toThrow("EXPO_PUBLIC_API_URL");
    expect(resolveApiUrls("production", { EXPO_PUBLIC_API_URL: "https://api.example.com" }).ios).toBe("https://api.example.com");
  });

  test("a bad port is an error", () => {
    expect(() => resolveApiUrls("e2e", { E2E_API_PORT: "http" })).toThrow("Not a port");
    expect(() => resolveApiUrls("e2e", { E2E_API_PORT: "70000" })).toThrow("Not a port");
  });
});

describe("resolveMapsKey", () => {
  test("preview and production throw when the key is missing", () => {
    expect(() => resolveMapsKey("preview", {})).toThrow("GOOGLE_MAPS_ANDROID_API_KEY");
    expect(() => resolveMapsKey("production", { GOOGLE_MAPS_ANDROID_API_KEY: "  " })).toThrow("GOOGLE_MAPS_ANDROID_API_KEY");
  });

  test("a release variant passes the key through", () => {
    expect(resolveMapsKey("production", { GOOGLE_MAPS_ANDROID_API_KEY: "test-key" })).toBe("test-key");
  });

  test("development works without a key", () => {
    expect(resolveMapsKey("development", {})).toBeUndefined();
    expect(resolveMapsKey("development", { GOOGLE_MAPS_ANDROID_API_KEY: "test-key" })).toBe("test-key");
  });

  test("the e2e variant never gets a key", () => {
    expect(resolveMapsKey("e2e", { GOOGLE_MAPS_ANDROID_API_KEY: "test-key" })).toBeUndefined();
  });
});

describe("assertReleaseEnv", () => {
  test("release variants refuse the capture and Storybook switches", () => {
    expect(() => assertReleaseEnv("production", { EXPO_PUBLIC_ALLOW_CAPTURE: "1" })).toThrow("EXPO_PUBLIC_ALLOW_CAPTURE");
    expect(() => assertReleaseEnv("preview", { EXPO_PUBLIC_STORYBOOK: "1" })).toThrow("EXPO_PUBLIC_STORYBOOK");
    expect(() => assertReleaseEnv("e2e", { EXPO_PUBLIC_ALLOW_CAPTURE: "1", EXPO_PUBLIC_STORYBOOK: "1" })).not.toThrow();
    expect(() => assertReleaseEnv("production", {})).not.toThrow();
  });
});
