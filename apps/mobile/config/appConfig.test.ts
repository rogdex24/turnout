import type { ExpoConfig } from "expo/config";
import appConfig from "../app.config";
import type { Variant } from "./variants";

const API = "https://api.turnout.example";

/** The Expo config for one variant, with only the env that variant needs. */
function configFor(variant: Variant): ExpoConfig {
  const saved = { ...process.env };
  try {
    for (const name of [
      "APP_VARIANT",
      "EXPO_PUBLIC_API_URL",
      "GOOGLE_MAPS_ANDROID_API_KEY",
      "EXPO_PUBLIC_ALLOW_CAPTURE",
      "EXPO_PUBLIC_STORYBOOK",
    ]) {
      delete process.env[name];
    }
    process.env.APP_VARIANT = variant;
    process.env.EXPO_PUBLIC_API_URL = API;
    process.env.GOOGLE_MAPS_ANDROID_API_KEY = "test-key";
    return appConfig({ config: {} as ExpoConfig, projectRoot: "", staticConfigPath: null, packageJsonPath: null });
  } finally {
    process.env = saved;
  }
}

/** The options of a plugin entry, or undefined when the plugin is not listed. */
function pluginOptions(config: ExpoConfig, name: string): Record<string, unknown> | undefined {
  const entry = (config.plugins ?? []).find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(entry) ? (entry[1] as Record<string, unknown>) : undefined;
}

const VARIANTS: Variant[] = ["development", "e2e", "preview", "production"];

test("cleartext traffic is allowed in the development and e2e variants only", () => {
  for (const variant of VARIANTS) {
    const android = pluginOptions(configFor(variant), "expo-build-properties")?.android as { usesCleartextTraffic: boolean };
    expect(android.usesCleartextTraffic).toBe(variant === "development" || variant === "e2e");
  }
});

test("release variants point at an https server and no variant overrides the iOS transport security default", () => {
  for (const variant of ["preview", "production"] as const) {
    expect((configFor(variant).extra as { apiUrl: { android: string } }).apiUrl.android).toMatch(/^https:\/\//);
  }
  for (const variant of VARIANTS) {
    expect(JSON.stringify(configFor(variant).ios?.infoPlist)).not.toContain("NSAppTransportSecurity");
  }
});

test("Android does not back up the app, in every variant", () => {
  for (const variant of VARIANTS) expect(configFor(variant).android?.allowBackup).toBe(false);
});

test("release builds drop the storage and overlay permissions, and the app asks for no other sensitive one", () => {
  for (const variant of ["preview", "production"] as const) {
    const android = configFor(variant).android;
    expect(android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
      ]),
    );
    // Only what the plugins add on top of this is checked in docs/release-gate.md, on the built bundle.
    expect(android?.permissions).toBeUndefined();
  }
  expect(configFor("development").android?.blockedPermissions).not.toContain("android.permission.SYSTEM_ALERT_WINDOW");
});

test("the permission texts say plainly what the app does with the photo and the location", () => {
  const config = configFor("production");
  const picker = pluginOptions(config, "expo-image-picker");
  expect(picker?.photosPermission).toBe("Turnout uses the photo you choose as your profile picture, so your group can find you.");
  expect(picker?.cameraPermission).toBe(false);
  expect(picker?.microphonePermission).toBe(false);
  const location = pluginOptions(config, "expo-location");
  expect(location?.locationWhenInUsePermission).toContain("how far you are from your group's cafe");
  expect(location?.locationWhenInUsePermission).toContain("Your location stays on your phone.");
  expect(location?.isAndroidBackgroundLocationEnabled).toBe(false);
  expect(location?.isIosBackgroundLocationEnabled).toBe(false);
});
