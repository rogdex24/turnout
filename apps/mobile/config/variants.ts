/**
 * The four app variants, as plain data and pure functions, so app.config.ts stays short and Jest can test the rules.
 * `APP_VARIANT` picks one: development (default), e2e, preview, production.
 */
export type Variant = "development" | "e2e" | "preview" | "production";

export const VARIANTS: readonly Variant[] = ["development", "e2e", "preview", "production"];

/** Port of `bun e2e/mobile-server.ts` in CI. The e2e variant points at it unless `E2E_API_PORT` says otherwise. */
export const DEFAULT_E2E_PORT = 3917;

/** Port of `bun src/cli.ts serve` on a developer machine. */
export const DEFAULT_DEV_PORT = 3000;

export interface VariantConfig {
  name: string;
  slug: string;
  bundleId: string;
  scheme: string;
  /** Storybook is bundled in the variants that have a screen to open it from. */
  storybook: boolean;
  /** Release variants need a Maps key; the build throws without one. */
  requiresMapsKey: boolean;
  /** The e2e variant ships with no Maps key, so the app shows the static map card. */
  mapsKey: boolean;
  /** Release variants have no default server: EXPO_PUBLIC_API_URL must come from the EAS variables. */
  requiresApiUrl: boolean;
}

export const VARIANT_CONFIG: Record<Variant, VariantConfig> = {
  development: {
    name: "Turnout (dev)",
    slug: "turnout",
    bundleId: "com.turnout.app.dev",
    scheme: "turnout-dev",
    storybook: true,
    requiresMapsKey: false,
    mapsKey: true,
    requiresApiUrl: false,
  },
  e2e: {
    name: "Turnout (e2e)",
    slug: "turnout",
    bundleId: "com.turnout.app.e2e",
    scheme: "turnout-e2e",
    storybook: true,
    requiresMapsKey: false,
    mapsKey: false,
    requiresApiUrl: false,
  },
  preview: {
    name: "Turnout (preview)",
    slug: "turnout",
    bundleId: "com.turnout.app.preview",
    scheme: "turnout-preview",
    storybook: false,
    requiresMapsKey: true,
    mapsKey: true,
    requiresApiUrl: true,
  },
  production: {
    name: "Turnout",
    slug: "turnout",
    bundleId: "com.turnout.app",
    scheme: "turnout",
    storybook: false,
    requiresMapsKey: true,
    mapsKey: true,
    requiresApiUrl: true,
  },
};

export function parseVariant(value: string | undefined): Variant {
  if (value === undefined || value === "") return "development";
  const found = VARIANTS.find((variant) => variant === value);
  if (!found) throw new Error(`APP_VARIANT must be one of ${VARIANTS.join(", ")}, got "${value}"`);
  return found;
}

export interface ApiUrls {
  android: string;
  ios: string;
}

type Env = Record<string, string | undefined>;

function port(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error(`Not a port: "${value}"`);
  return parsed;
}

/**
 * The API base URL per platform. `EXPO_PUBLIC_API_URL` wins and applies to both. Without it, development and e2e use the host
 * machine: the Android emulator reaches it at 10.0.2.2, the iOS simulator at localhost. Preview and production have no default.
 */
export function resolveApiUrls(variant: Variant, env: Env): ApiUrls {
  const explicit = env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return { android: explicit, ios: explicit };
  if (VARIANT_CONFIG[variant].requiresApiUrl) {
    throw new Error(`EXPO_PUBLIC_API_URL is required for the ${variant} variant. Set it as an EAS variable.`);
  }
  const hostPort = variant === "e2e" ? port(env.E2E_API_PORT, DEFAULT_E2E_PORT) : port(env.DEV_API_PORT, DEFAULT_DEV_PORT);
  return { android: `http://10.0.2.2:${hostPort}`, ios: `http://localhost:${hostPort}` };
}

/**
 * The Google Maps key for Android, or undefined when the variant ships without one. A release variant with no key throws, so a
 * build never goes out with a blank map. The value comes from the EAS variable or the git-ignored apps/mobile/.env.local.
 */
export function resolveMapsKey(variant: Variant, env: Env): string | undefined {
  const config = VARIANT_CONFIG[variant];
  if (!config.mapsKey) return undefined;
  const key = env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  if (key) return key;
  if (config.requiresMapsKey) {
    throw new Error(
      `GOOGLE_MAPS_ANDROID_API_KEY is required for the ${variant} variant. Set it as an EAS variable or in apps/mobile/.env.local.`,
    );
  }
  return undefined;
}

/**
 * Release variants never ship the screenshot switch the e2e variant sets (plan section 6, App hardening), and never bundle Storybook.
 * Both switches are inlined by the bundler, so the check has to fail the build before it starts.
 */
export function assertReleaseEnv(variant: Variant, env: Env): void {
  if (variant !== "preview" && variant !== "production") return;
  for (const name of ["EXPO_PUBLIC_ALLOW_CAPTURE", "EXPO_PUBLIC_STORYBOOK"]) {
    if (env[name] && env[name] !== "0") throw new Error(`${name} must not be set for the ${variant} variant.`);
  }
}
