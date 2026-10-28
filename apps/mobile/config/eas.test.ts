import fs from "node:fs";
import path from "node:path";
import { assertReleaseEnv, parseVariant } from "./variants";

type Profile = { extends?: string; env?: Record<string, string>; android?: { buildType?: string }; channel?: string };
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "eas.json"), "utf8")) as {
  build: Record<string, Profile>;
  submit: { production: { android: { track: string } } };
};

/** The env a profile builds with: its own values over the ones it extends. */
function envOf(name: string): Record<string, string> {
  const profile = eas.build[name];
  if (!profile) throw new Error(`no profile ${name}`);
  return { ...(profile.extends ? envOf(profile.extends) : {}), ...profile.env };
}

test("every profile that sets APP_VARIANT sets a known one, and the release profiles pass the release env check", () => {
  for (const name of ["development", "development-simulator", "e2e", "preview", "production"]) {
    const env = envOf(name);
    const variant = parseVariant(env.APP_VARIANT);
    expect(() => assertReleaseEnv(variant, env)).not.toThrow();
  }
  expect(envOf("preview").APP_VARIANT).toBe("preview");
  expect(envOf("production").APP_VARIANT).toBe("production");
  expect(envOf("e2e").APP_VARIANT).toBe("e2e");
});

test("only the e2e profile allows screen capture", () => {
  for (const name of Object.keys(eas.build)) {
    expect(envOf(name).EXPO_PUBLIC_ALLOW_CAPTURE).toBe(name === "e2e" ? "1" : undefined);
  }
});

test("production is an AAB for the internal track and preview is an APK on the preview channel", () => {
  expect(eas.build.production?.android?.buildType).toBe("app-bundle");
  expect(eas.submit.production.android.track).toBe("internal");
  expect(eas.build.preview?.android?.buildType).toBe("apk");
  expect(eas.build.preview?.channel).toBe("preview");
});
