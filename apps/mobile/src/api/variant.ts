import Constants from "expo-constants";
import { Platform } from "react-native";

/** The build variant app.config.ts put in `extra.variant`: development, e2e, preview or production. */
export function appVariant(): string {
  const variant = Constants.expoConfig?.extra?.variant;
  return typeof variant === "string" ? variant : "production";
}

/** The variant exactly as the config set it, or undefined where there is none (a test run, Storybook). */
export function configuredVariant(): string | undefined {
  const variant = Constants.expoConfig?.extra?.variant;
  return typeof variant === "string" ? variant : undefined;
}

/** Dev and e2e builds take a full seed phone number, because the staging server's allowlist holds the seed members. */
export function allowSeedNumbers(variant: string = appVariant()): boolean {
  return variant === "development" || variant === "e2e";
}

/**
 * The real map needs a Maps key on Android (iOS draws Apple Maps, which needs none). A build without a key, and the e2e build, which
 * never has one, shows the static map card.
 */
export function showsRealMap(
  platform: string = Platform.OS,
  variant: string = appVariant(),
  hasKey: boolean = Constants.expoConfig?.extra?.hasMapsKey === true,
): boolean {
  if (variant === "e2e") return false;
  return platform === "ios" || hasKey;
}
