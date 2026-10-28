import path from "node:path";
import { colors } from "@turnout/design-tokens/tokens";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { androidIntentFilters, resolveLinkHost } from "./config/appLinks.ts";
import { FONT_FAMILIES } from "./config/fonts.ts";
import { assertReleaseEnv, parseVariant, resolveApiUrls, resolveMapsKey, VARIANT_CONFIG } from "./config/variants.ts";

/** Font paths relative to the app folder, so the EAS fingerprint does not depend on where the repo is checked out. */
const fontPath = (pkg: string, file: string) => path.relative(__dirname, require.resolve(`${pkg}/${file}`));

/**
 * One config, four variants (APP_VARIANT: development, e2e, preview, production). Each has its own bundle id, so they install side by
 * side. Secrets never live in this file: the Maps key comes from the EAS variable GOOGLE_MAPS_ANDROID_API_KEY or from the git-ignored
 * apps/mobile/.env.local, and the config throws when a release variant has none.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env;
  const variant = parseVariant(env.APP_VARIANT);
  const v = VARIANT_CONFIG[variant];
  assertReleaseEnv(variant, env);
  const apiUrl = resolveApiUrls(variant, env);
  const mapsKey = resolveMapsKey(variant, env);
  // App links belong to the production package that assetlinks.json names, so the other variants never claim the host.
  const linkHost = variant === "production" ? resolveLinkHost(env) : null;
  const intentFilters = androidIntentFilters(linkHost);

  // EAS fills this in `eas init`. Without it the app builds and runs, it just cannot fetch updates.
  const easProjectId = env.EAS_PROJECT_ID;
  // The Sentry plugin uploads source maps, so it is added only when the build has an organisation and project to upload to.
  const sentry =
    env.SENTRY_ORG && env.SENTRY_PROJECT
      ? [["@sentry/react-native/expo", { organization: env.SENTRY_ORG, project: env.SENTRY_PROJECT }]]
      : [];

  return {
    ...config,
    name: v.name,
    slug: v.slug,
    version: "0.1.0",
    scheme: v.scheme,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    runtimeVersion: { policy: "fingerprint" },
    updates: easProjectId ? { url: `https://u.expo.dev/${easProjectId}`, checkAutomatically: "ON_LOAD" } : { enabled: false },
    ios: {
      bundleIdentifier: v.bundleId,
      supportsTablet: false,
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: v.bundleId,
      ...(intentFilters.length > 0 ? { intentFilters } : {}),
      ...(env.GOOGLE_SERVICES_JSON ? { googleServicesFile: env.GOOGLE_SERVICES_JSON } : {}),
      ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}),
    },
    plugins: [
      ["expo-router", { origin: false }],
      ["expo-splash-screen", { backgroundColor: colors.light.bg, dark: { backgroundColor: colors.dark.bg } }],
      [
        "expo-font",
        {
          android: {
            fonts: FONT_FAMILIES.map((family) => ({
              fontFamily: family.fontFamily,
              fontDefinitions: family.faces.map((face) => ({ path: fontPath(family.pkg, face.file), weight: face.weight })),
            })),
          },
          ios: { fonts: FONT_FAMILIES.flatMap((family) => family.faces.map((face) => fontPath(family.pkg, face.file))) },
        },
      ],
      "expo-secure-store",
      "expo-image",
      // The profile photo comes from the system picker, which needs no permission on Android. No camera and no microphone: both are blocked.
      [
        "expo-image-picker",
        {
          photosPermission: "Turnout uses the photo you choose as your profile picture, so your group can find you.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
      // Android pushes arrive on `plans` unless the sender names another channel (the app makes `plans`, `show-day` and `thread`). iOS has no
      // remote push until an Apple account exists (GET /config push.ios is false), so the aps-environment entitlement is left out.
      ["expo-notifications", { color: colors.light.signal, defaultChannel: "plans", enableRemoteNotifications: false }],
      // Foreground location only, for the walk time on the meet card. It never leaves the phone, and nothing runs in the background.
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Turnout shows how far you are from your group's cafe while your meet card is live. Your location stays on your phone.",
          isAndroidBackgroundLocationEnabled: false,
          isIosBackgroundLocationEnabled: false,
        },
      ],
      // The WhatsApp one-tap code: the activity WhatsApp launches and the <queries> for both WhatsApp apps. Android only.
      "./modules/whatsapp-otp/app.plugin.js",
      [
        "expo-build-properties",
        {
          android: { minSdkVersion: 24, usesCleartextTraffic: variant === "development" || variant === "e2e" },
          ios: { deploymentTarget: "16.4" },
        },
      ],
      ...sentry,
    ] as NonNullable<ExpoConfig["plugins"]>,
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: {
      variant,
      apiUrl,
      storybook: v.storybook,
      hasMapsKey: Boolean(mapsKey),
      ...(linkHost ? { linkHost } : {}),
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  };
};
