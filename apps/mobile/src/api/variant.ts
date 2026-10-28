import Constants from "expo-constants";

/** The build variant app.config.ts put in `extra.variant`: development, e2e, preview or production. */
export function appVariant(): string {
  const variant = Constants.expoConfig?.extra?.variant;
  return typeof variant === "string" ? variant : "production";
}

/** Dev and e2e builds take a full seed phone number, because the staging server's allowlist holds the seed members. */
export function allowSeedNumbers(variant: string = appVariant()): boolean {
  return variant === "development" || variant === "e2e";
}
